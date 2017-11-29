const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const env = require('node-env-file');
const Sequelize = require('sequelize');

const dbPath = 'lester.db';

env(__dirname + '/.env');

const sequelize = new Sequelize('database', 'username', 'password', {
  host: 'localhost',
  dialect: 'sqlite',

  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },

  storage: dbPath,

  // http://docs.sequelizejs.com/manual/tutorial/querying.html#operators
  operatorsAliases: false
});

const User = sequelize.define('user', {
  id: {type: Sequelize.INTEGER, primaryKey: true},
  love_index: {type: Sequelize.INTEGER, defaultValue: 0}
});

const Love = sequelize.define('love', {
  id: {type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true},
  content: {type: Sequelize.TEXT, allowNull: false},
  sentiment: {type: Sequelize.INTEGER, defaultValue: 0},
  status: {type: Sequelize.INTEGER, defaultValue: -1}
});

User.belongsToMany(Love, {through: 'UserLove'});
Love.belongsToMany(User, {through: 'UserLove'});

sequelize.sync()

const importFile = (user_id, filepath, callback) => {
  User.findOne({
    where: {id: user_id}
  }).then(user => {
    user.love_index = 0;
    user.save({fields: ['love_index']}).then(() => {
      user.setLoves([]).then(() => {
        let count = 0;

        var lineReader = require('readline').createInterface({
          input: require('fs').createReadStream(filepath)
        });

        const loves = []

        lineReader.on('line', function (line) {
          loves.push({content: line});
        });

        lineReader.on('close', function () {
          Love.bulkCreate(loves).then(() => {
            Love.findAll({
              where: {status: -1}
            }).then(loves => {
              user.setLoves(loves).then(() => {
                Love.update(
                  {status: 0},
                  { where: {status: -1} }
                );
                callback(loves.length);
              });
            });
          });
        });
      });
    });
  });
}

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

  const user_id = msg.from.id;

  if(msg.document && msg.document.file_id) {

    telegram_bot.sendMessage(chatId, `Importing file...`);
    const downloadPath = path.join(path.dirname(process.mainModule.filename), 'download');

    telegram_bot.downloadFile(msg.document.file_id, downloadPath).then((filepath) => {
      importFile(user_id, filepath, (count) => {
        telegram_bot.sendMessage(chatId, `File imported - ${count} names`);
      });
    });

  } else {

    let keyboard = [
      {text: 'start', callback_data: 'start'},
    ]

    const opts = {
      reply_markup: JSON.stringify({
        inline_keyboard: [keyboard]
      })
    };

    User.findOne({
      where: {id: user_id}
    }).then(user => {

      let message = "I know you, would you like to start?";

      if(!user) {

        User.create({
          id: user_id,
          loves: [
            {content: 'mom'},
            {content: 'dad'},
            {content: 'hater'}
          ]
        }, {
          include: [ Love ]
        }).then(user => {
          message = "User created";
          telegram_bot.sendMessage(chatId, message, opts);
        });

      } else {
        telegram_bot.sendMessage(chatId, message, opts);
      }


    });

  }

});

telegram_bot.on('callback_query', function onCallbackQuery(callbackQuery) {
  const msg = callbackQuery.message;

  let keyboard = [
    {text: 'love', callback_data: 'love'},
  ]

  const user_id = msg.chat.id;

  const opts = {
    reply_markup: JSON.stringify({
      inline_keyboard: [keyboard]
    })
  };

  User.findOne({
    where: {id: user_id}
  }).then(user => {
    if(!user)
      return null;

    user.getLoves().then(loves => {
      telegram_bot.sendMessage(msg.chat.id, loves[user.love_index].content, opts);
      if(user.love_index + 1 >= loves.length) {
        user.update({love_index: 0}).then(() => {})
      } else {
        user.increment('love_index');
      }
    });
  });

});
