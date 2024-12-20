# SEKOIA Telegram Bot

This is a Telegram bot for SEKOIA, designed to assess if SEKOIA is a fit as an investor for your idea. The bot guides users through a series of questions and collects their responses, including uploading PDF files to Google Drive.

## Features

- Collects user information through a series of questions
- Allows users to upload PDF files
- Stores user responses and uploads files to Google Drive
- Supports skipping questions and going back to previous questions
- Sends a summary of the user's responses to a specified Telegram chat group

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- A Telegram bot token
- Google Drive API credentials

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/sekoia-tg-bot.git
   cd sekoia-tg-bot
   ```

2. Install the dependencies:
   ```sh
   npm install
   ```

3. Create a `.env` file in the root directory and add your environment variables:
   ```properties
   BOT_TOKEN=your_telegram_bot_token
   GOOGLE_DRIVE_FOLDER_ID=your_google_drive_folder_id
   TARGET_CHAT_ID=your_target_chat_id
   ```

4. Add your Google Drive API credentials in a file named `googleApiKeyFile.json` in the root directory.

## Usage

To start the bot, run the following command:
   ```sh
   node index.js
   ```

## Bot Commands

- `/start`: Start the bot and begin the questionnaire.
- `Abort`: Abort the current operation.
- `Back`: Go back to the previous question.
- `Skip`: Skip the current question (if applicable).

## File Structure

- `index.js`: Main bot logic and flow.
- `data/userAnswers.json`: Stores user responses.
- `download/`: Directory to store downloaded PDF files.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.