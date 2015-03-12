var client = angular.module('mafia.client', []);

// Настройки клиента
client.constant('Config', {
  serverURL: 'http://mafia.x3n.me/', // URL сервера

  timeouts: {
    connection: 20, // На подключение
    message: 10, // На отправку сообщений
    voteTimeout: 5 // На голосование
  }
});

client.service('GameManager', function ($rootScope, $timeout, Config) {
  this.socket = null;
  this.userData = {};

  // Флаг, показывающий наличие установки соединения
  this.assertionActive = false;
  // Список обрабатываемых событий
  this.events = [];

  // Текущий установленный таймаут
  this.timeout = null;

  // Инициализация менеджера игры.
  // При удачном/неудачном выполнении вызывается callback, имеющий аргументом
  // соответствующий код состояния. В зависимости от кода состояния приложение
  // должно инициализироваться с различными начальными видами.
  this.initialize = function (callback) {
    // Подгрузка сохраненных данных
    if (typeof localStorage['userData'] != 'undefined') {
      this.userData = JSON.parse(localStorage['userData']);
    }

    // Создание объекта сокета, если он еще не создан
    if (!this.socket) {
      this.socket = io(Config.serverURL);
    }

    // Если игрок выходил из комнаты, не завершив игру, предлагаем ему
    // присоединиться к комнате снова.
    var lastRoomID = localStorage['lastRoomID'];
    if (typeof lastRoomID != 'undefined') {
      delete localStorage['lastRoomID'];
      $rootScope.$broadcast('lastRoomID', {
        id: lastRoomID
      });
    }

    this.setAssertionTimeout(function () {
      callback(false);
    }, Config.timeouts['connection']);

    this.assertConnection(
      // Успешное подключение
      (function (socket) {
        if (!this.userData.playerID) {
          // Если необходимо получить ID игрока, то ждем ответа от сервера,
          // прежде чем отключаться, иначе получим undefined вместо ID.
          socket.once('playerIDReturned', (function (id) {
            this.userData.playerID = id;
            localStorage['userData'] = JSON.stringify(this.userData);
            socket.io.disconnect();
          }).bind(this));
          socket.emit('getNewPlayerID');
        } else {
          // Если необходимо просто удостовериться, то отключаемся сразу.
          socket.io.disconnect();
        }
        callback(true);
      }).bind(this),

      // Неудачное подключение
      function () {
        callback(false);
      }
    );
  };

  // Подтверждение подключения
  this.assertConnection = function (succCallback, failCallback) {
    // В случае, если имеем уже наличествующее соединение, прерываем
    // вызов метода.
    if (this.assertionActive) {
      return;
    }

    // В случае успешного подключения удаляем обработчик ошибок и сообщаем
    // об успешном результате.
    this.socket.once('connect', (function () {
      this.socket.removeAllListeners('connect_error');
      this.cancelAssertionTimeout();
      succCallback(this.socket);
      this.assertionActive = false;
    }).bind(this));

    // В случае неудачного подключения, наоборот, удаляем обработчик
    // подключения и отсоединяемся от сокета, чтобы избежать последующих
    // переподключений.
    this.socket.once('connect_error', (function () {
      this.socket.removeAllListeners('connect');
      this.cancelAssertionTimeout();
      this.socket.disconnect();
      failCallback();
      this.assertionActive = false;
    }).bind(this));

    // Переподключение в случае, если сокет подключен
    if (this.socket.connected) {
      this.socket.disconnect();
    }

    // Непосредственно устанавливаем соединение
    this.assertionActive = true;
    this.socket.connect();
  };

  /*
  // Установка/возобновление подключения
  this.connectIfNecessary = function (succCallback, failCallback) {
    if (this.socket.connected) {
      this.cancelAssertionTimeout();
      succCallback(this.socket);
    } else {
      this.assertConnection(succCallback, failCallback);
    }
  };
  */

  // Установка таймаута (в секундах)
  this.setAssertionTimeout = function (callback, timeout) {
    if (this.timeout) {
      return;
    }

    // По истечении таймаута производим зачистку сокета
    this.timeout = $timeout((function () {
      this.socket.removeAllListeners('connect');
      this.socket.removeAllListeners('connect_error');
      this.socket.io.disconnect();
      callback();
      this.timeout = null;
      this.assertionActive = false;
    }).bind(this), timeout * 1000);
  };

  // Отмена таймаута
  this.cancelAssertionTimeout = function () {
    if (this.timeout) {
      $timeout.cancel(this.timeout);
      this.timeout = null;
    }
  };

  // Установка обработчика события
  this.setEventHandler = function (event, callback) {
    this.socket.on(event, function (data) {
      $rootScope.$apply(function () {
        callback(data);
      });
    });
    if (this.events.indexOf(event) == -1) {
      this.events.push(event);
    }
  };

  // Удаление обработчика события
  this.clearEvent = function (event) {
    this.socket.removeAllListeners(event);
    this.events.splice(this.events.indexOf(event), 1);
  };

  // Удаление всех обработчиков
  this.clearAllEvents = function () {
    for (var i = 0; i < this.events.length; i++) {
       this.socket.removeAllListeners(this.events[i]);
    }
    this.events = [];
  };

  // Отключение от сокета
  this.disconnect = function () {
    this.clearAllEvents();
    this.cancelAssertionTimeout();
    this.socket.disconnect();
  };

  // Установка имени игрока
  this.setPlayerName = function (name) {
    this.userData.playerName = name;
    localStorage['userData'] = JSON.stringify(this.userData);
  };

  // Получение ID комнаты
  this.acquireRoomID = function (method, callback) {
    this.socket.once('roomIDReturned', callback);

    // Отправка запроса на получение ID комнаты
    this.socket.emit(method);
  };

  // Подключение к комнате.
  // В callback передается основная информация о комнате.
  this.connectToRoom = function (id, callback) {
    localStorage['lastRoomID'] = id;
    this.socket.once('roomData', callback);

    // Отправка подтверждения подключения к комнате
    this.socket.emit('ackRoom', {
      roomID: id,
      playerID: this.userData.playerID,
      playerName: this.userData.playerName
    });
  };

  // Начало игры
  this.startGame = function () {
    this.socket.emit('startGame');
  };

  // Покинуть игру
  this.leaveGame = function() {
    this.socket.emit('leaveGame');
  }

  // Отправка сообщения
  this.sendMessage = function (message, id, callback) {
    if (typeof id != 'undefined' && typeof callback != 'undefined') {
      var timeout = $timeout(function () {
        callback(false, id);
      }, Config.timeouts['message']);

      // На случай, если сообщения перемешаются, передаем ID
      socket.once('messageConfirmed', function (id) {
        callback(true, id);
        $timeout.cancel(timeout);
      });
      socket.once('messageRejected', function (id) {
        callback(false, id);
        $timeout.cancel(timeout);
      });
    }

    this.socket.emit('chatMessage', {
      message: message,
      id: id
    });
  };

  // Отправка голосования
  this.vote = function (vote, callback) {
    if (typeof callback != 'undefined') {
      var timeout = $timeout(function () {
        callback(false);
      }, Config.timeouts['vote']);

      socket.once('voteConfirmed', function () {
        callback(true);
        $timeout.cancel(timeout);
      });
      socket.once('voteRejected', function () {
        callback(false);
        $timeout.cancel(timeout);
      });
    }

    this.socket.emit('playerVote', {
      vote: vote
    });
  };
});