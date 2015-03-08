var c = angular.module('mafia.controllers', []);

// Локализованные названия ролей
c.constant('Roles', {
  'civilian': "мирный житель",
  'mafia': "мафиози",
  'detective': "комиссар"
});

// Контроллер главного экрана
c.controller('MainController', function ($scope, $state, $ionicLoading,
  $ionicHistory, $ionicPopup, GameManager, Config) {

  $scope.isDefined = function (variable) {
    return (typeof variable != 'undefined');
  };

  // Создание новой игры
  $scope.newGame = function (method) {
    var eventName;
    if (method == 'find') {
      eventName = 'findRoom';
    } else if (method == 'new') {
      eventName = 'newRoom';
    }

    if (typeof eventName != 'undefined') {
      $ionicLoading.show({
        template: '<div class="icon icon-big ion-loading-c"></div>'
      });

      GameManager.setAssertionTimeout(function() {
        $ionicLoading.hide();
        $ionicPopup.alert({
          title: "Ошибка подключения",
          template: "Время подключения истекло."
        });
      }, Config.timeouts['connection']);

      // Убеждаемся в наличии/отсутствии соединения и вызываем
      // соответствуюющий коллбэк.
      GameManager.assertConnection(
        function () {
          GameManager.acquireRoomID(eventName, function (id) {
            $ionicLoading.hide();
            $state.go('room', {
              id: id
            });
          });
        },
        function () {
          $ionicLoading.hide();
          $ionicPopup.alert({
            title: "Ошибка подключения",
            template: "Не удалось установить соединение с сервером."
          });
        }
      );
    }
  };

  // Повтор подключения к серверу
  $scope.reconnect = function () {
    $ionicLoading.show({
      template: '<div class="icon icon-big ion-loading-c"></div>'
    });
    GameManager.initialize(function (success) {
      $ionicLoading.hide();
      $scope.$apply(function () {
        $scope.isSuccess = success;
      });
    });
  };

  // Установка имени игрока
  $scope.setName = function () {
    $ionicPopup.prompt({
      title: "Введите имя:"
    }).then(function (res) {
      if (typeof res != 'undefined') {
        GameManager.setPlayerName(res);
      }
    });
  };

  // Обработка сообщения об успешном/неудачном подключении
  $scope.$on('connection', function (event, args) {
    $scope.$apply(function () {
      $scope.isSuccess = args.success;
    });
  });

  // Так как вид главный, то очищаем историю переходов
  $ionicHistory.clearHistory();
});

// Контроллер комнаты
c.controller('RoomController', function ($scope, $state, $stateParams,
  $ionicHistory, $ionicPopup, $ionicScrollDelegate, GameManager, Roles) {

  $scope.id = $stateParams.id;
  $scope.messages = [];

  // Состояние комнаты
  $scope.roomData = {
    playerIndex: null,  // Индекс игрока (начиная с 0!)
    playerList: [],     // Список имен игроков в комнате
    role: null,         // Роль игрока
    state: null,        // Состояние игры
    exposedPlayers: {}  // Список игроков, чья роль известна
  };

  // Доступна ли кнопка начала игры
  $scope.canStartGame = false;

  // Доступно ли голосование
  $scope.canVote = function () {
    if ($scope.roomData.state === null) {
      return false;
    }
    return $scope.roomData.state.isVoting && ($scope.roomData.
      role == 'mafia' || $scope.roomData.state.isDay);
  };

  // Доступен ли чат
  $scope.canChat = function () {
    if ($scope.roomData.role === null) {
      return true;
    }
    if ($scope.roomData.state === null) {
      return $scope.roomData.role == 'mafia';
    }
    return $scope.roomData.role == 'mafia' || $scope.roomData.state.isDay;
  }

  // Добавление информационного сообщения в чат
  $scope.logMessage = function (message) {
    $scope.messages.push({
      isLog: true,
      message: message
    });
  };

  // Отправка сообщения
  $scope.sendMessage = function () {
    if (typeof $scope.roomData == 'undefined') {
      return;
    }

    $scope.messages.push({
      isLog: false,
      playerIndex: $scope.roomData.playerIndex + 1,
      playerName: GameManager.userData.playerName,
      message: this.chatMessage // WTF, Angular?
    });

    GameManager.sendMessage(this.chatMessage);
    this.chatMessage = "";

    $ionicScrollDelegate.scrollBottom(true);
  };

  // Начало игры
  $scope.startGame = function () {
    GameManager.startGame();
  };

  // Выход из игры
  $scope.leaveGame = function () {
    GameManager.leaveGame();
    GameManager.disconnect();
    $ionicHistory.goBack();
  };

  // Если имеем уже активное подключение
  if (GameManager.socket.connected) {
    // Отправляем запрос на подключение к комнате
    GameManager.connectToRoom($stateParams.id, function (data) {
      $scope.$apply(function () {
        // Заполняем поля структуры в соответствии с присланными данными
        for (var field in $scope.roomData) {
          if (field in data) {
            $scope.roomData[field] = data[field];
          }
        }
        $scope.canStartGame = data.canStartGame;
      });
      if (data.isFirstConnection) {
        $scope.logMessage("Добро пожаловать в игру!");
      }
    });
  } else {
    // Если не удалось получить данные
    $state.go('main');
  }

  // Обновление данных комнаты
  GameManager.setEventHandler('update', function (data) {
    $scope.roomData.state = data.state;
    if (data.outvotedPlayer) {
      $scope.roomData.elimPlayers[data.outvotedPlayer.playerIndex] = {
        role: data.outvotedPlayer.role,
        eliminated: true
      };
    }
  });

  // Начало игры
  GameManager.setEventHandler('gameStarted', function (data) {
    // Отключаем кнопку начала игры
    $scope.canStartGame = false;

    // Обновляем информацию об игре
    $scope.roomData.role = data.role;
    if ('mafiaMembers' in data) {
      for (var index in data.mafiaMembers) {
        $scope.roomData.exposedPlayers[index] = {
          role: 'mafia',
          eliminated: false
        };
      }
    }

    $scope.logMessage("Игра началась. Вы — " + Roles[data.role] + ".");
  });

  // Конец игры
  GameManager.setEventHandler('gameEnded', function (data) {
    if (data.isMafiaWin) {
      $scope.logMessage("Победила мафия!");
    } else {
      $scope.logMessage("Победили мирные жители!");
    }
  });

  // Подключение игрока
  GameManager.setEventHandler('playerJoined', function (data) {
    $scope.roomData.playerList.push(data.playerName);
    $scope.logMessage("Игрок " + data.playerName + " присоединяется к игре.");
  });

  // Уход игрока
  GameManager.setEventHandler('playerLeft', function (data) {});

  // Сообщение чата
  GameManager.setEventHandler('chatMessage', function (data) {
    $scope.messages.push({
      playerIndex: data.playerIndex + 1,
      playerName: $scope.roomData.playerList[data.playerIndex],
      message: data.message
    });
    if ($ionicScrollDelegate.getScrollPosition().top >= angular.element(
        '.chat').height() - angular.element('.chat-window').height()) {
      $ionicScrollDelegate.scrollBottom(true);
    }
  });

  // Голосование игрока
  GameManager.setEventHandler('playerVote', function (data) {});
});