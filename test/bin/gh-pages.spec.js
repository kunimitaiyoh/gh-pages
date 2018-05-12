var ghpages = require('../../lib/index');
var sinon = require('sinon');
var cli = require('../../bin/gh-pages');

describe('gh-pages', function() {
  beforeEach(function() {
    sinon.stub(ghpages, 'publish');
  });

  afterEach(function() {
    ghpages.publish.restore();
  });

  var splitArgs = (function() {
    var pattern = /(?:"([^"]+)"|([^ ]+))/g;

    return function(args) {
      pattern.lastIndex = 0;
      var output = [];
      var matched = pattern.exec(args);
      while (matched) {
        output.push(matched[1] !== undefined ? matched[1] : matched[2]);
        matched = pattern.exec(args);
      }
      return output;
    };
  })();

  var defaults = {
    repo: undefined,
    silent: false,
    branch: 'gh-pages',
    src: '**/*',
    dest: '.',
    message: 'Updates',
    dotfiles: false,
    add: false,
    remote: 'origin',
    push: true,
    localUser: false,
    author: undefined
  };

  var scenarions = [
    ['--dist lib', 'lib', defaults],
    ['--dist lib -n', 'lib', {push: false}],
    ['--dist lib -x', 'lib', {silent: true}],
    ['--dist lib --dotfiles', 'lib', {dotfiles: true}],
    ['--dist lib --dest target', 'lib', {dest: 'target'}],
    ['--dist lib -a', 'lib', {add: true}],
    ['--dist lib --local-user', 'lib', {localUser: true}],
    [
      '--dist lib -A "Jane Doe <janedoe@example.com>"',
      'lib',
      {author: 'Jane Doe <janedoe@example.com>'}
    ]
  ];

  scenarions.forEach(function(scenario) {
    var args = splitArgs(scenario[0]);
    var dist = scenario[1];
    var config = scenario[2];

    it(args.join(' '), function() {
      cli(['node', 'gh-pages'].concat(args));
      sinon.assert.calledWithMatch(ghpages.publish, dist, config);
    });
  });
});
