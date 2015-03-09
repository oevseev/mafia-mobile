var app = angular.module('mafia', ['ionic', 'mafia.client', 'mafia.controllers']);

// Настройка видов и контроллеров
app.config(function ($stateProvider, $urlRouterProvider) {
  // Главное меню игры
  $stateProvider.state('main', {
    url: '/',
    templateUrl: 'views/main.html',
    controller: 'MainController'
  });

  // Комната
  $stateProvider.state('room', {
    url: '/id/:id',
    templateUrl: 'views/room.html',
    controller: 'RoomController'
  });

  $urlRouterProvider.otherwise('/');
});

// Настройка Ionic
app.config(function ($ionicConfigProvider) {
  with ($ionicConfigProvider) {
    backButton.text("Выйти");
    navBar.alignTitle("center");
  }
});

// Инициализация приложения Ionic
app.run(function ($rootScope, $ionicPlatform, GameManager) {
  $ionicPlatform.ready(function () {
    if (window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }

    // Инициализация менеджера игры
    GameManager.initialize(function (success) {
      $rootScope.$broadcast('connection', {
        success: success
      });
    });
  });
});