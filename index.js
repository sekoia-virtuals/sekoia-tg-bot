require('dotenv').config();
const { Telegraf, Scenes, session, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const fetch = require('node-fetch');
const {Web3} = require('web3');

const bot = new Telegraf(process.env.BOT_TOKEN);

const questions = [
    "Hello and welcome to SEKOIA! We are here to assess if SEKOIA is a fit as an investor for your idea. Please pardon the dust as we are in alpha and early testing mode.\n\n[1/5] First, please provide a PDF of your deck ",
    "[2/5] What is your LinkedIn profile? Please provide the full URL (e.g., https://www.linkedin.com/in/username)",
    "[3/5] What is your GitHub profile? Please provide the full URL (e.g., https://github.com/username)",
    "[4/5] We require that you are holding at least 10 SEKOIA in your wallet. Please share your wallet address where you are holding SEKOIA:",
    "[5/5] Do you have any additional materials you would like to share? For ex, whitepaper, tokenomics etc.? (Upload PDF if you have additional materials)"
];

const dataFolderPath = path.join(__dirname, 'data');
const userAnswersPath = path.join(dataFolderPath, 'userAnswers.json');

// Check if the data folder exists
if (!fs.existsSync(dataFolderPath)) {
  // Create the data folder if it doesn't exist
  fs.mkdirSync(dataFolderPath);
}

const downloadPath = path.join(__dirname, 'download');
let userAnswers = {};

// Ensure the download directory exists
if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath);
}

// Load user answers from file
if (fs.existsSync(userAnswersPath)) {
    userAnswers = JSON.parse(fs.readFileSync(userAnswersPath, 'utf8'));
}

// Save user answers to file
function saveUserAnswers() {
    fs.writeFileSync(userAnswersPath, JSON.stringify(userAnswers, null, 2));
}

// Authenticate Google Drive API
const auth = new google.auth.GoogleAuth({
    keyFile: './googleApiKeyFile.json',
    scopes: ['https://www.googleapis.com/auth/drive.file']
});
const drive = google.drive({ version: 'v3', auth });

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.BASE_CHAIN_RPC_URL));
const sekoiaTokenContractAddress = '0x1185cB5122Edad199BdBC0cbd7a0457E448f23c7';
const sekoiaTokenDecimals = 18;

const sekoiaTokenABI = [
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    }
];

const sekoiaTokenContract = new web3.eth.Contract(sekoiaTokenABI, sekoiaTokenContractAddress);

// Define the wizard scene
const wizardScene = new Scenes.WizardScene(
    'wizard',
    (ctx) => {
        ctx.reply(questions[0], Markup.inlineKeyboard([
            Markup.button.callback('Abort', 'abort')
        ]));
        ctx.wizard.state.answers = [];
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.document && ctx.message.document.file_name.endsWith('.pdf')) {
            const processingMessage = await ctx.reply('We are processing the file, please wait...');
            const fileId = ctx.message.document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const originalFileName = ctx.message.document.file_name;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const newFileName = `${path.parse(originalFileName).name}-${timestamp}${path.parse(originalFileName).ext}`;
            const filePath = path.join(downloadPath, newFileName);
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            fs.writeFileSync(filePath, buffer);

            // Upload to Google Drive
            const fileMetadata = {
                name: newFileName,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
            };
            const media = {
                mimeType: 'application/pdf',
                body: fs.createReadStream(filePath)
            };
            const file = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink'
            });

            // Make the file public
            await drive.permissions.create({
                fileId: file.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });

            const shareableLink = file.data.webViewLink;

            ctx.wizard.state.answers.push(shareableLink);
            await ctx.deleteMessage(processingMessage.message_id);
            ctx.reply(questions[1], Markup.inlineKeyboard([
                Markup.button.callback('Back', 'back'),
                Markup.button.callback('Skip', 'skip'),
                Markup.button.callback('Abort', 'abort')
            ]));
            return ctx.wizard.next();
        } else {
            ctx.reply('Please upload a PDF file.');
        }
    },
    async (ctx) => {
        if (ctx.message.text) {
            ctx.wizard.state.answers.push(ctx.message.text);
        } else {
            ctx.wizard.state.answers.push('Not provided');
        }
        ctx.reply(questions[2], Markup.inlineKeyboard([
            Markup.button.callback('Back', 'back'),
            Markup.button.callback('Skip', 'skip'),
            Markup.button.callback('Abort', 'abort')
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text) {
            const walletAddress = ctx.message.text;
            try {
                const balance = await sekoiaTokenContract.methods.balanceOf(walletAddress).call();
                const balanceInTokens = web3.utils.fromWei(balance, 'ether');
                if (parseFloat(balanceInTokens) >= 10) {
                    ctx.wizard.state.answers.push(walletAddress);
                    ctx.reply(questions[4], Markup.inlineKeyboard([
                        Markup.button.callback('Back', 'back'),
                        Markup.button.callback('Skip', 'skip'),
                        Markup.button.callback('Abort', 'abort')
                    ]));
                    return ctx.wizard.next();
                } else {
                    ctx.reply(`Insufficient Sekoia balance, minimum 10 required, current balance ${balanceInTokens}. Please try with another wallet.`);
                }
            } catch (error) {
                ctx.reply('Error checking balance. Please try again.');
            }
        } else {
            ctx.reply('Please provide a valid wallet address.');
        }
    },
    async (ctx) => {
        if (ctx.message.text) {
            ctx.wizard.state.answers.push(ctx.message.text);
        } else {
            ctx.wizard.state.answers.push('None');
        }
        ctx.reply(questions[4], Markup.inlineKeyboard([
            Markup.button.callback('Back', 'back'),
            Markup.button.callback('Skip', 'skip'),
            Markup.button.callback('Abort', 'abort')
        ]));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.document && ctx.message.document.file_name.endsWith('.pdf')) {
            const processingMessage = await ctx.reply('We are processing the file, please wait...');
            const fileId = ctx.message.document.file_id;
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const originalFileName = ctx.message.document.file_name;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const newFileName = `${path.parse(originalFileName).name}-${timestamp}${path.parse(originalFileName).ext}`;
            const filePath = path.join(downloadPath, newFileName);
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            fs.writeFileSync(filePath, buffer);

            // Upload to Google Drive
            const fileMetadata = {
                name: newFileName,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID]
            };
            const media = {
                mimeType: 'application/pdf',
                body: fs.createReadStream(filePath)
            };
            const file = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink'
            });

            // Make the file public
            await drive.permissions.create({
                fileId: file.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });

            const shareableLink = file.data.webViewLink;

            ctx.wizard.state.answers.push(shareableLink);
            await ctx.deleteMessage(processingMessage.message_id);
        } else if (ctx.message.text) {
            ctx.reply('Please upload a PDF file.');
            return;
        } else {
            ctx.wizard.state.answers.push('None');
        }

        const finalMessage = `New Submission:\n\nTelegram Handle: @${ctx.from.username}\nDeck: ${ctx.wizard.state.answers[0]}\nLinkedIn: ${ctx.wizard.state.answers[1]}\nGithub: ${ctx.wizard.state.answers[2]}\nWallet: ${ctx.wizard.state.answers[3]}\nAdditional Materials: ${ctx.wizard.state.answers[4]}`;
        await ctx.telegram.sendMessage(process.env.TARGET_CHAT_ID, finalMessage);

        ctx.reply('Thank you! We have received and evaluated your submission. We will review and get back to you shortly with next steps.');
        userAnswers[ctx.from.id] = {
            answers: ctx.wizard.state.answers,
            submitTime: new Date().toLocaleString()
        };
        saveUserAnswers();

        return ctx.scene.leave();
    }
);

wizardScene.action('back', (ctx) => {
    ctx.wizard.back();
    ctx.wizard.state.answers.pop(); // Remove the last answer
    const previousQuestionIndex = ctx.wizard.cursor - 1;
    if (previousQuestionIndex >= 0) {
        const buttons = [
            Markup.button.callback('Abort', 'abort')
        ];
        if (previousQuestionIndex > 0) {
            buttons.unshift(Markup.button.callback('Back', 'back'));
        }
        if (previousQuestionIndex !== 0 && previousQuestionIndex !== 3) { // Skip button not shown for wallet address step or first step
            buttons.splice(1, 0, Markup.button.callback('Skip', 'skip'));
        }
        ctx.reply(questions[previousQuestionIndex], Markup.inlineKeyboard(buttons));
    }
});

wizardScene.action('skip', async (ctx) => {
    const currentIndex = ctx.wizard.cursor;
    if (currentIndex === questions.length) {
        ctx.wizard.state.answers.push('None');
    } else {
        ctx.wizard.state.answers.push('Not provided');
    }
    let nextIndex = currentIndex + 1;
    ctx.wizard.selectStep(nextIndex);

    nextIndex = nextIndex - 1 // ctx.wizard.cursor is start from 1

    if (nextIndex < questions.length) {
        const buttons = [
            Markup.button.callback('Back', 'back'),
            Markup.button.callback('Skip', 'skip'),
            Markup.button.callback('Abort', 'abort')
        ];
        if (nextIndex === 3) { // Skip button not shown for wallet address step
            buttons.splice(1, 1);
        }
        ctx.reply(questions[nextIndex], Markup.inlineKeyboard(buttons));
    } else {
        const finalMessage = `New Submission:\n\nTelegram Handle: @${ctx.from.username}\nDeck: ${ctx.wizard.state.answers[0]}\nLinkedIn: ${ctx.wizard.state.answers[1]}\nGithub: ${ctx.wizard.state.answers[2]}\nWallet: ${ctx.wizard.state.answers[3]}\nAdditional Materials: ${ctx.wizard.state.answers[4]}`;
        await ctx.telegram.sendMessage(process.env.TARGET_CHAT_ID, finalMessage);

        ctx.reply('Thank you! We have received and evaluated your submission. We will review and get back to you shortly with next steps.');
        userAnswers[ctx.from.id] = {
            answers: ctx.wizard.state.answers,
            submitTime: new Date().toLocaleString()
        };
        saveUserAnswers();

        return ctx.scene.leave();
    }
});

wizardScene.action('abort', (ctx) => {
    ctx.reply('You aborted the submission. You can always re-start the flow by sending /start');
    return ctx.scene.leave();
});

// Create the stage and register the wizard scene
const stage = new Scenes.Stage([wizardScene]);

bot.use(session());
bot.use(stage.middleware());

bot.start((ctx) => {
    const userId = ctx.from.id;
    if (userAnswers[userId]) {
        const { answers, submitTime } = userAnswers[userId];
        const previousMessage = `According to our records, you submitted an application on ${submitTime}:\n\nTelegram Handle: @${ctx.from.username}\nDeck: ${answers[0]}\nLinkedIn: ${answers[1]}\nGithub: ${answers[2]}\nWallet: ${answers[3]}\nAdditional Materials: ${answers[4]}`;
        ctx.reply(previousMessage, Markup.inlineKeyboard([
            Markup.button.callback('ReSubmit', 'resubmit')
        ]));
    } else {
        ctx.scene.enter('wizard');
    }
});

// Handle /start command
bot.command('start', (ctx) => {
    const userId = ctx.from.id;
    if (userAnswers[userId]) {
        const { answers, submitTime } = userAnswers[userId];
        const previousMessage = `According to our records, you submitted an application on ${submitTime}:\n\nTelegram Handle: @${ctx.from.username}\nDeck: ${answers[0]}\nLinkedIn: ${answers[1]}\nGithub: ${answers[2]}\nWallet: ${answers[3]}\nAdditional Materials: ${answers[4]}`;
        ctx.reply(previousMessage, Markup.inlineKeyboard([
            Markup.button.callback('ReSubmit', 'resubmit')
        ]));
    } else {
        ctx.scene.enter('wizard');
    }
});

// Handle any text message
bot.on('text', (ctx) => {
    ctx.reply('Send /start to or click the Start button to get started', Markup.inlineKeyboard([
        Markup.button.callback('Start', 'start')
    ]));
});

bot.action('resubmit', (ctx) => {
    ctx.scene.enter('wizard');
});

bot.action('start', (ctx) => {
    ctx.scene.enter('wizard');
});

bot.launch();