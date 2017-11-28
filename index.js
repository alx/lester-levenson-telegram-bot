const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const env = require('node-env-file');

env(__dirname + '/.env');

let lovers = require('./names.json');
let loveIndex = 0;

if(!process.env.TELEGRAM_TOKEN) {
  console.log('missing TELEGRAM_TOKEN in .env file');
  return null;
}
const telegram_bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true});

telegram_bot.on('polling_error', (error) => {
  console.log(error);
  console.log('TELEGRAM_TOKEN already connected somewhere else');
  process.exit();
});

telegram_bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if(msg.chat.type != 'private')
    return null;

  let keyboard = [
    {text: 'start', callback_data: 'start'},
  ]

  const opts = {
    reply_to_message_id: msg.message_id,
    reply_markup: JSON.stringify({
      inline_keyboard: [keyboard]
    })
  };

  telegram_bot.sendMessage(chatId, lovers[loveIndex], opts);
});

telegram_bot.on('callback_query', function onCallbackQuery(callbackQuery) {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;

  let keyboard = [
    {text: 'love', callback_data: 'love'},
  ]

  const opts = {
    reply_markup: JSON.stringify({
      inline_keyboard: [keyboard]
    })
  };

  loveIndex += 1;
  if(loveIndex == lovers.length)
    loveIndex = 0;

  telegram_bot.sendMessage(msg.chat.id, lovers[loveIndex], opts);

});
