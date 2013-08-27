AngularJS-tern-plugin
=====================

A, slow'ish moving, WIP plugin for Tern that enables it to understand AngularJS dependency injection.

[View Example](http://www.youtube.com/watch?v=kDdkfHWqVU0)

## Installation

1. Install [tern](https://github.com/marijnh/tern_for_sublime)
2. Copy the **angular.js** file from this repository into your **tern_for_sublime** plugin directory. For Example:

  ```bash
    cp /path/to/angular.js ~/Library/Application Support/Sublime Text 3/Packages/tern_for_sublime/node_modules/tern/plugin
  ```
3. Create your `.tern-project` file in the base of your project (if you haven't already) and add angular to the plugins. An example .tern-project file with this setup could be:

  ```js
    {
      "libs": [
        "browser",
        "jquery",
        "ecma5",
        "underscore"
      ],
      "plugins": {
        "angular": "./"
      }
    }
  ```
4. Make sure if you are using the [AngularJS Sublime Text Package](https://github.com/angular-ui/AngularJS-sublime-package) that you open User Settings for the package (AngularJS-sublime-package.sublime-settings) and change turn off default JS completions, e.g.:

  ```js
    { "disable_default_js_completions": true }
  ```

The completions are worth the effort.
