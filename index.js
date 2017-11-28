const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const env = require('node-env-file');

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('lester.db');

env(__dirname + '/.env');

const initDatabase = () => {
  db.serialize(function() {
    db.run(`PRAGMA foreign_keys = ON`);
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id integer PRIMARY KEY,
      love_index INTEGER DEFAULT 0,
      session_timestamp INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS loves (
      id integer PRIMARY KEY AUTOINCREMENT,
      content text NOT NULL,
      sentiment integer DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS user_loves (
      user_id integer,
      love_id integer,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(love_id) REFERENCES loves(id) ON DELETE CASCADE
    )`);
    db.run(`CREATE INDEX IF NOT EXISTS userindex ON user_loves(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS loveindex ON user_loves(love_id)`);
  });
}
initDatabase();

const insertLoveContent = (user_id, content) => {
  db.run(`INSERT INTO loves (content) VALUES ($content)`,
    {$content: content},
    function(err) {
      db.run(`INSERT INTO user_loves VALUES ($user_id, $love_id)`,
        {$user_id: user_id, $love_id: this.lastID}
      );
    }
  );
}

const initUser = (user_id, callback) => {
  db.serialize(function() {
    db.run(`INSERT INTO users (id) VALUES ($id)`,
      {$id: user_id},
      function() {
        insertLoveContent(user_id, 'mom');
        insertLoveContent(user_id, 'dad');
        insertLoveContent(user_id, 'hater');
      }
    );
  });
  callback();
}

const getCurrentLoveIndex = (user_id, callback) => {
  db.get(`SELECT love_index FROM users
    WHERE id = $user_id`,
    {$user_id: user_id},
    function(err, row) {
      callback(row.love_index);
    }
  );
}

const setCurrentLoveIndex = (user_id, love_index, callback) => {
  db.get(`SELECT count(*) count FROM user_loves
    WHERE user_id = $user_id`,
    {$user_id: user_id},
    function(err, row) {
      love_index += 1;
      if(love_index == row.count) {
        love_index = 0;
      }
      db.run(`UPDATE users SET love_index = $love_index WHERE id = $user_id`,
             {$love_index: love_index, $user_id: user_id},
             () => {callback(love_index)})
    }
  );
}

const fetchUserLove = (user_id, callback) => {
  db.serialize(function() {
    getCurrentLoveIndex(user_id, (love_index) => {
      setCurrentLoveIndex(user_id, love_index, (love_index) => {
        db.get(`SELECT * FROM loves l
               LEFT JOIN user_loves ul ON ul.love_id = l.id
               WHERE ul.user_id = $user_id
               LIMIT $love_index, 1`,
               {$love_index: love_index, $user_id: user_id},
               function(err, row) {
                 callback(row.content);
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

  db.get(`SELECT * FROM users WHERE id=$id`,
    {$id: msg.from.id},
    (err, row) => {

      if(typeof(row) == 'undefined') {
        //welcome message
        initUser(msg.from.id, () => {
          let keyboard = [
            {text: 'start', callback_data: 'start'},
          ]

          const opts = {
            reply_to_message_id: msg.message_id,
            reply_markup: JSON.stringify({
              inline_keyboard: [keyboard]
            })
          };

          telegram_bot.sendMessage(chatId, "User created", opts);
        });
      } else {
        //start session?
        let keyboard = [
          {text: 'start', callback_data: 'start'},
        ]

        const opts = {
          reply_markup: JSON.stringify({
            inline_keyboard: [keyboard]
          })
        };

        telegram_bot.sendMessage(chatId, "I know you, would you like to start?", opts);
      }
    });


});

telegram_bot.on('callback_query', function onCallbackQuery(callbackQuery) {
  const msg = callbackQuery.message;

  let keyboard = [
    {text: 'love', callback_data: 'love'},
  ]

  const opts = {
    reply_markup: JSON.stringify({
      inline_keyboard: [keyboard]
    })
  };
  db.get(`SELECT * FROM users WHERE id=$id`,
    {$id: msg.from.id},
    (err, row) => {

      if(typeof(row) == 'undefined') {
        //welcome message
        initUser(msg.from.id, () => {
          fetchUserLove(msg.from.id, (content) => {
            telegram_bot.sendMessage(msg.chat.id, content, opts);
          });
        });
      } else {
        fetchUserLove(msg.from.id, (content) => {
          telegram_bot.sendMessage(msg.chat.id, content, opts);
        });
      }
    }
  );
});
