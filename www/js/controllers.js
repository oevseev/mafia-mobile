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
        templateUrl: 'views/loading.html'
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
      templateUrl: 'views/loading.html'
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
c.controller('RoomController', function ($scope, $state, $stateParams, $timeout,
  $ionicHistory, $ionicModal, $ionicPopover, $ionicPopup, $ionicScrollDelegate,
  GameManager, Roles) {

  // Вид списка игроков
  $ionicPopover.fromTemplateUrl('views/players.html', {
    scope: $scope
  }).then(function (popover) {
    $scope.playerListView = popover;
  });

  // Вид голосования
  $ionicModal.fromTemplateUrl('views/vote.html', {
    scope: $scope
  }).then(function (modal) {
    $scope.voteView = modal;
  });

  // ID комнаты и список сообщений
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
  };

  // Получение имени роли игрока
  $scope.getPlayerRoleClass = function (index) {
    var roleClass = '';
    var epEntry = $scope.roomData.exposedPlayers[index];

    if (index == $scope.roomData.playerIndex) {
      roleClass = $scope.roomData.playerRole + ' me';
    } else {
      if (epEntry) {
        roleClass = epEntry.role;
      } else {
        return 'unknown';
      }
    }

    if (epEntry && !epEntry.eliminated) {
      roleClass += ' alive';
    }

    return roleClass;
  };

  // Можно ли проголосовать против игрока
  $scope.canBeVoted = function (index) {
    if (index == $scope.roomData.playerIndex) {
      return false;
    }
    if (index in $scope.roomData.exposedPlayers) {
      return !$scope.roomData.exposedPlayers[index].eliminated;
    }
    return true;
  };

  // Добавление информационного сообщения в чат
  $scope.logMessage = function (message) {
    $scope.messages.push({
      isLog: true,
      message: message
    });

    $ionicScrollDelegate.scrollBottom(true);
  };

  // Отправка сообщения
  $scope.sendMessage = function () {
    if (typeof $scope.roomData == 'undefined' || !this.chatMessage) {
      return;
    }

    $scope.messages.push({
      isLog: false,
      playerIndex: $scope.roomData.playerIndex + 1,
      playerName: $scope.roomData.playerList[$scope.roomData.playerIndex],
      message: this.chatMessage // WTF, Angular?
    });

    GameManager.sendMessage(this.chatMessage);
    this.chatMessage = "";

    $ionicScrollDelegate.scrollBottom(true);
    $timeout(function() {
      angular.element('#chat-input').focus();
    });
  };

  // Голосование
  $scope.vote = function (vote) {
    $scope.voteView.hide();
    GameManager.vote(vote);
    $scope.logMessage("Вы проголосовали против игрока #" + (vote + 1) + ".");
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

  // Показ списка игроков
  $scope.showPlayerList = function ($event) {
    $scope.playerListView.show($event);
  };

  // Показ вида голосования
  $scope.showVoteView = function () {
    $scope.voteView.show();
  };

  $scope.closeVoteView = function () {
    $scope.voteView.hide();
  };

  /*
  $scope.getPlayerGrid = function (rowSize) {
    var playerList = $scope.roomData.playerList.slice();

    // Заполняем массив пустыми элементами для выравнивания
    var phCount = playerList.length % rowSize ? rowSize - (playerList.length %
      rowSize) : 0;
    var placeholder = Array.apply(null, new Array(phCount)).map(function () {
      return '';
    });
    playerList = playerList.concat(placeholder);

    // Разбиваем массив на группы
    var playerGrid = [];
    for (var i = 0; i < playerList.length; i += rowSize) {
      playerGrid.push(playerList.slice(i, i + rowSize));
    }
    return playerGrid;
  };
  */

  $scope.$on('$destroy', function () {
    $scope.playerListView.remove()
    $scope.voteView.remove();
  });

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
    // Если подключение к комнате не было произведено заранее
    $state.go('main');
  }

  // Обновление данных комнаты
  GameManager.setEventHandler('update', function (data) {
    $scope.roomData.state = data.state;
    if (data.outvotedPlayer) {
      $scope.roomData.exposedPlayers[data.outvotedPlayer.playerIndex] = {
        role: data.outvotedPlayer.role,
        eliminated: true
      };
    }

    if (data.state.isVoting) {
      $scope.logMessage("Начинается голосование!");
    } else {
      var message,
        outcome;

      if (data.state.isDay) {
        message = "Наступает день, просыпаются мирные жители.";
        outcome = "убит";
      } else {
        message = "Наступает ночь. Мирные жители засыпают, просыпается мафия.";
        outcome = "посажен в тюрьму";
      }

      if (data.outvotedPlayer) {
        $scope.logMessage("Игрок #" + (data.outvotedPlayer.playerIndex + 1) +
          " (" + Roles[data.outvotedPlayer.role] + ") был " + outcome + ".");
      }
      $scope.logMessage(message);
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

    // Сброс состояния игры до первоначального
    $scope.canStartGame = ($scope.roomData.playerIndex === 0);
    with ($scope.roomData) {
      role = null;
      state = null;
      exposedPlayers = {};
    }
  });

  // Подключение игрока
  GameManager.setEventHandler('playerJoined', function (data) {
    $scope.roomData.playerList.push(data.playerName);
    $scope.logMessage("Игрок " + data.playerName + " присоединяется к игре.");
  });

  // Уход игрока
  GameManager.setEventHandler('playerLeft', function (data) {
    $scope.logMessage("Игрок #" + (data.playerIndex + 1) + " выходит из игры.");
  });

  // Сообщение чата
  GameManager.setEventHandler('chatMessage', function (data) {
    $scope.messages.push({
      playerIndex: data.playerIndex + 1,
      playerName: $scope.roomData.playerList[data.playerIndex],
      message: data.message
    });

    $ionicScrollDelegate.scrollBottom(true);
  });

  // Голосование игрока
  GameManager.setEventHandler('playerVote', function (data) {
    $scope.logMessage("Игрок #" + (data.playerIndex + 1) +
      "голосует против игрока" + (data.vote + 1) + "!");
  });
});