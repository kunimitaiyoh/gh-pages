var Git = require('./git');
var base64url = require('base64url');
var copy = require('./util').copy;
var fs = require('fs-extra');
var globby = require('globby');
var path = require('path');
var util = require('util');

var log = util.debuglog('gh-pages');

function getCacheDir() {
  return path.relative(process.cwd(), path.resolve(__dirname, '../.cache'));
}

function getRepo(options) {
  if (options.repo) {
    return Promise.resolve(options.repo);
  } else {
    var git = new Git(process.cwd(), options.git);
    return git.getRemoteUrl(options.remote);
  }
}

/**
 * parse a string as an author with RFC 5322 format (like "Author Name <author@address.com>").
 * @param {string} author Author with RFC 5322 format.
 * @returns {object | null} { name: string, address: string } if the string is valid, null otherwise.
 */
function parseAuthor(author) {
  return require('email-addresses').parseOneAddress(author);
}

/**
 * Push a git branch to a remote (pushes gh-pages by default).
 * @param {string} basePath The base path.
 * @param {Object} config Publish options.
 * @param {Function} callback Callback.
 */
exports.publish = function publish(basePath, config, callback) {
  if (typeof config === 'function') {
    callback = config;
    config = {};
  }

  var defaults = {
    dest: '.',
    add: false,
    git: 'git',
    depth: 1,
    dotfiles: false,
    branch: 'gh-pages',
    remote: 'origin',
    src: '**/*',
    only: '.',
    push: true,
    message: 'Updates',
    silent: false
  };

  var options = Object.assign({}, defaults, config);

  if (!callback) {
    callback = function(err) {
      if (err) {
        log(err.message);
      }
    };
  }

  function done(err) {
    try {
      callback(err);
    } catch (err2) {
      log('Publish callback threw: %s', err2.message);
    }
  }

  try {
    if (!fs.statSync(basePath).isDirectory()) {
      done(new Error('The "base" option must be an existing directory'));
      return;
    }
  } catch (err) {
    done(err);
    return;
  }

  var files = globby
    .sync(options.src, {
      cwd: basePath,
      dot: options.dotfiles
    })
    .filter(function(file) {
      return !fs.statSync(path.join(basePath, file)).isDirectory();
    });

  if (!Array.isArray(files) || files.length === 0) {
    done(
      new Error('The pattern in the "src" property didn\'t match any files.')
    );
    return;
  }

  var only = globby.sync(options.only, {cwd: basePath}).map(function(file) {
    return path.join(options.dest, file);
  });

  var repoUrl;
  return getRepo(options)
    .then(function(repo) {
      repoUrl = repo;
      var clone = options.clone;
      if (!clone) {
        clone = path.join(getCacheDir(), base64url(repo));
      }
      log('Cloning %s into %s', repo, clone);
      return Git.clone(repo, clone, options.branch, options);
    })
    .then(function(git) {
      return git.getRemoteUrl(options.remote).then(function(url) {
        if (url !== repoUrl) {
          var message =
            'Remote url mismatch.  Got "' +
            url +
            '" ' +
            'but expected "' +
            repoUrl +
            '" in ' +
            git.cwd +
            '.  Try running the `gh-pages-clean` script first.';
          throw new Error(message);
        }
        return git;
      });
    })
    .then(function(git) {
      // only required if someone mucks with the checkout between builds
      log('Cleaning');
      return git.clean();
    })
    .then(function(git) {
      log('Fetching %s', options.remote);
      return git.fetch(options.remote);
    })
    .then(function(git) {
      log('Checking out %s/%s ', options.remote, options.branch);
      return git.checkout(options.remote, options.branch);
    })
    .then(function(git) {
      if (!options.add) {
        log('Removing files');
        return git.rm(only.join(' '));
      } else {
        return git;
      }
    })
    .then(function(git) {
      log('Copying files');
      return copy(
        files,
        basePath,
        path.join(git.cwd, options.dest)
      ).then(function() {
        return git;
      });
    })
    .then(function(git) {
      log('Adding all');
      return git.add('.');
    })
    .then(function(git) {
      var configureAuthorAndReturn = function(email, name) {
        return git.exec('config', 'user.email', email).then(function() {
          return git.exec('config', 'user.name', name);
        });
      };

      if (options.user) {
        return configureAuthorAndReturn(options.user.email, options.user.name);
      } else if (options.author) {
        var author = parseAuthor(options.author);
        if (author !== null) {
          return configureAuthorAndReturn(author.name, author.address);
        } else {
          var message =
            'The author is invalid. ' +
            '(must be RFC 5322 format like "Author Name <author@address.com>").';
          throw new Error(message);
        }
      } else if (options.localUser) {
        return Promise.all([
          new Git(process.cwd()).exec('config', '--local', 'user.name'),
          new Git(process.cwd()).exec('config', '--local', 'user.email')
        ]).then(result => {
          return configureAuthorAndReturn(result[0], result[1]);
        });
      } else {
        return git;
      }
    })
    .then(function(git) {
      log('Committing');
      return git.commit(options.message);
    })
    .then(function(git) {
      if (options.tag) {
        log('Tagging');
        return git.tag(options.tag).catch(function(error) {
          // tagging failed probably because this tag alredy exists
          log(error);
          log('Tagging failed, continuing');
          return git;
        });
      } else {
        return git;
      }
    })
    .then(function(git) {
      if (options.push) {
        log('Pushing');
        return git.push(options.remote, options.branch);
      } else {
        return git;
      }
    })
    .then(
      function() {
        done();
      },
      function(error) {
        if (options.silent) {
          error = new Error(
            'Unspecified error (run without silent option for detail)'
          );
        }
        done(error);
      }
    );
};

/**
 * Clean the cache directory.
 */
exports.clean = function clean() {
  fs.removeSync(getCacheDir());
};
