require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.on('message', (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const messageId = ctx.message.message_id;
    const username = ctx.from.username || 'N/A';
    const firstName = ctx.from.first_name || 'N/A';
    const lastName = ctx.from.last_name || 'N/A';

    console.log('User ID:', userId);
    console.log('Chat ID:', chatId);
    console.log('Chat Type:', chatType);
    console.log('Message ID:', messageId);
    console.log('Username:', username);
    console.log('First Name:', firstName);
    console.log('Last Name:', lastName);
    console.log('-------------------------');

    let replyMessage = `User ID: ${userId}\nChat ID: ${chatId}\nChat Type: ${chatType}\nMessage ID: ${messageId}\nUsername: ${username}\nFirst Name: ${firstName}\nLast Name: ${lastName}`;

    if (chatType === 'group' || chatType === 'supergroup') {
        const groupTitle = ctx.chat.title || 'N/A';
        console.log('Group Title:', groupTitle);
        replyMessage += `\nGroup Title: ${groupTitle}`;
    }

    // ctx.reply(replyMessage);
});

bot.launch();