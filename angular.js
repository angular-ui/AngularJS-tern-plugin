(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern"], mod);
  mod(tern, tern);
})(function(infer, tern) {

  "use strict";

  function injectDirectiveReturnFnTypes (fn) {
    if(!fn.originNode) return;
    var ngDefinitions = infer.cx().definitions.angularjs;
    var retvalArgs = [];
    var retvalArgTypes = ['Scope', 'jQueryLite', 'Attrs'];
    var returnFnTypes = fn.originNode.body.scope.fnType.retval.types;

    if(returnFnTypes && returnFnTypes.length && returnFnTypes[0].hasProp && returnFnTypes[0].hasProp('link')){
      returnFnTypes = returnFnTypes[0].getProp('link');
      returnFnTypes = returnFnTypes.types;
    }

    if(returnFnTypes && returnFnTypes.length && returnFnTypes[0].args)
      retvalArgs = returnFnTypes[0].args;
    for(var i = 0; i < retvalArgs.length && i < retvalArgTypes.length; i++){
      retvalArgs[i].addType(ngDefinitions[retvalArgTypes[i]]);
    }
  }

  function tryToDefinedConstructorExpression (userInjectors) {
    var ngDefinitions = infer.cx().definitions.angularjs;
    var definedList = [];
    userInjectors.forEach(function(fn){
      var defined = {}, obj;
      if(fn.argNodes && fn.argNodes.length == 2){
        if(fn.argNodes[0].type == 'Literal'){
          defined.name = fn.argNodes[0].value;
        }
        fn = fn.argNodes[1];
        if(fn.type == 'ArrayExpression'){
          fn = fn.elements[fn.elements.length-1];
        }
        if(fn.type == 'FunctionExpression'){
          if(defineReturnValue(defined.name, fn)) return;
          if(
            fn.body &&
            fn.body.scope &&
            fn.body.scope.fnType &&
            fn.body.scope.fnType.self.forward &&
            fn.body.scope.fnType.self.forward.length
          ){
            obj = new infer.Obj(true);
            fn.body.scope.fnType.self.forward.forEach(function(item){
              if(item.target){
                var aVal = obj.defProp(item.prop);
                aVal.addType(item.target);
              }
            });
            defined.value = obj;
          }
        }
      }
      if(defined.name && defined.value){
        ngDefinitions[defined.name] = obj;
      }
    });
  }

  function defineReturnValue (name, fn) {
    var ngDefinitions = infer.cx().definitions.angularjs;
    var value = null;
    if(fn.body && fn.body.scope && fn.body.scope.fnType){
      var fnType = fn.body.scope.fnType;
      if(fnType.retval.types && fnType.retval.types.length){
        value = fnType.retval.types[0];
      }
    }
    if(name && value){
      ngDefinitions[name] = value;
      return true;
    }
    return false;
  }

  function tryToDefinedReturnValue (userInjectors) {
    var definedList = [];
    userInjectors.forEach(function(fn){
      var name = '';
      var _fn;
      if(fn.argNodes && fn.argNodes.length == 2){
        if(fn.argNodes[0].type == 'Literal'){
          name = fn.argNodes[0].value;
        }
        _fn = fn.argNodes[1];
        if(_fn.type == 'ArrayExpression'){
         _fn = _fn.elements[_fn.elements.length-1]; // function should be last item in array
        }
        if(_fn.type == 'FunctionExpression'){
          defineReturnValue(name, _fn);
        }
      }
    });
  }

  function injectTypesIntoFnParams (fn){
    if(!fn.argNames) return {}; // there are no args passed into function
    var ngDefinitions = infer.cx().definitions.angularjs;
    var argName = '';

    for(var i = 0; i < fn.argNames.length; i++){
      argName = fn.argNames[i];
      if(ngDefinitions[argName]){
        if(fn.args[i]){
          fn.args[i].addType(ngDefinitions[argName], 101);
        }
      }
    }
    return fn;
  }

  function getFnFromArray (arr){
    var types = [];
    if(arr.props['<i>'] && arr.props['<i>'].types && arr.props['<i>'].types.length){
      types = arr.props['<i>'].types;
      for(var i = 0; i < types.length; i++){
        if(types[i].proto.name == 'Function.prototype')
          return types[i];
      }
    }
    return {};
  }

  function tryToInjectTypes (args){
    var fn = {};
    if(args && args.length == 2 && args[1].proto){
      if(args[1].proto.name == 'Function.prototype'){
        fn = injectTypesIntoFnParams(args[1]);
      }else if(args[1].proto.name == 'Array.prototype'){
        fn = injectTypesIntoFnParams(getFnFromArray(args[1]));
      }
    }
    return fn;
  }

  function getInjectorsThatReturnVals(_self){
    var injectables = [];
    var injectableTypes = ['factory', 'filter', 'provider'];

    injectableTypes.forEach(function(item){
      var prop = _self.getProp(item);
      if(prop.forward && prop.forward.length)
        injectables = injectables.concat(prop.forward);
    });
    return injectables;
  }

  infer.registerFunction('ngInject', function(_self, args, argNodes) {
    tryToInjectTypes(args);
    return infer.ANull;
  });

  infer.registerFunction("ngDirectiveInject", function(_self, args, argNodes) {
    var fn = tryToInjectTypes(args);
    injectDirectiveReturnFnTypes(fn);
    return infer.ANull;
  });

  infer.registerFunction("ngReturnValInject", function(_self, args, argNodes) {
    var fn = tryToInjectTypes(args);
    tryToDefinedReturnValue(getInjectorsThatReturnVals(_self));
    return infer.ANull;
  });

  infer.registerFunction('ngServiceInject', function(_self, args, argNodes) {
    var fn = tryToInjectTypes(args);
    var service = _self.getProp('service');
    if(service.forward && service.forward.length)
      tryToDefinedConstructorExpression(service.forward);
    return infer.ANull;
  });

  infer.registerFunction('ngValueInject', function(_self, args, argNodes) {
    var values = _self.getProp('value');
    var ngDefinitions = infer.cx().definitions.angularjs;
    if(values.forward && values.forward.length){
      values.forward.forEach(function(fn){
        if(fn.argNodes && fn.argNodes.length == 2){
          if(fn.argNodes[0].type == 'Literal'){
            ngDefinitions[fn.argNodes[0].value] = fn.args[1];
          }
        }
      });
    }
  });

  tern.registerPlugin("angular", function(server, options) {
    server._angularJS = {
      interfaces: Object.create(null),
      options: options || {},
      currentFile: null,
      server: server
    };

    server.on("beforeLoad", function(file) {
      this._angularJS.currentFile = file.name;
    });
    server.on("reset", function(file) {
      this._angularJS.interfaces = Object.create(null);
    });
    return {defs: defs};
  });

  var defs = {
    "!name": "angularjs",
    "!define": {
      "$anchorScroll": {
        "!type": "fn()"
      },
      "$animate": {
        "addClass": {
          "!type": "fn(element: jQueryLite, className: string, done: ?)"
        },
        "enabled":{
          "!type": "fn(value: bool) -> bool"
        },
        "enter": {
          "!type": "fn(element: jQueryLite, parent: jQueryLite, after: jQueryLite, done: ?)"
        },
        "leave": {
          "!type": "fn(element: jQueryLite, done: ?)"
        },
        "move": {
          "!type": "fn(element: jQueryLite, parent: jQueryLite, after: jQueryLite, done: ?)"
        },
        "removeClass": {
          "!type": "fn(element: jQueryLite, className: string, done: ?)"
        }
      },
      "$document": {
        "!proto": "jQueryLite"
      },
      "cacheFactoryObjInfo": {
        "id": {},
        "size": {},
        "options": {}
      },
      "cacheFactoryObj": {
        "info": {
          "!type": "fn() -> cacheFactoryObjInfo"
        },
        "put": {
          "!type": "fn(key: string, value: ?)"
        },
        "get": {
          "!type": "fn(key: string) -> ?"
        },
        "remove": {
          "!type": "fn(key: string)"
        },
        "removeAll": {
          "!type": "fn()"
        },
        "destroy": {
          "!type": "fn()"
        }
      },
      "$cacheFactory": {
        "!type": "fn(cacheId: string, options: obj) -> cacheFactoryObj"
      },
      "$compile": {
        "!type": "fn(element: string, transclude: fn(), maxPriority: number) -> fn(scope: ?, cloneAttachFn: fn())"
      },
      "$controller": {
        "!type": "fn(constructor: fn(), locals: obj) -> obj"
      },
      "$cookies": {
        "!type": "fn(?) -> ?"
      },
      "$cookieStore": {
        "get": {
          "!type": "fn(key: string) -> obj"
        },
        "put": {
          "!type": "fn(key: string, value: obj)"
        },
        "remove": {
          "!type": "fn(key: string)"
        }
      },
      "Deferred": {
        "resolve": {
          "!type": "fn(value: ?)"
        },
        "reject": {
          "!type": "fn(reason: ?)"
        },
        "promise": {
          "!proto": "Promise"
        }
      },
      "EmitEvent": {
        "!type": "fn()",
        "prototype": {
          "targetScope": {
            "!type": "+Scope"
          },
          "currentScope": {
            "!type": "+Scope"
          },
          "name": {
            "!type": "string"
          },
          "stopPropagation": {
            "!type": "fn()"
          },
          "preventDefault": {
            "!type": "fn()"
          },
          "defaultPrevented": {
            "!type": "bool"
          }
        }
      },
      "$exceptionHandler": {
        "!type": "fn(exception: error, cause: string)"
      },
      "$filter": {
        "!type": "fn(name: string) -> fn()"
      },
      "$httpBackend": {
        "when": {
          "!type": "fn(method: string, url: string, data: string, headers: ?)"
        },
        "whenDELETE": {
          "!type": "fn(url: string, headers: ?)"
        },
        "whenGET": {
          "!type": "fn(url: string, headers: ?)"
        },
        "whenHEAD": {
          "!type": "fn(url: string, headers: ?)"
        },
        "whenJSONP": {
          "!type": "fn(url: string)"
        },
        "whenPATCH": {
          "!type": "fn(url: string, data: string, headers: ?)"
        },
        "whenPOST": {
          "!type": "fn(url: string, data: string, headers: ?)"
        },
        "whenPUT": {
          "!type": "fn(url: string, data: string, headers: ?)"
        }
      },
      "HttpPromise": {
        "success": {
          "!type": "fn(callback: fn(data: ?, status: number, headers: ?, config: obj)) -> HttpPromise"
        },
        "error": {
          "!type": "fn(callback: fn(data: ?, status: number, headers: ?, config: obj)) -> HttpPromise"
        },
        "then": {
          "!type": "fn(successCallback: fn(), errorCallback: fn()) -> HttpPromise"
        }
      },
      "$http": {
        "get": {
          "!type": "fn(url: string, config: obj) -> HttpPromise"
        },
        "head": {
          "!type": "fn(url: string, config: obj) -> HttpPromise"
        },
        "post": {
          "!type": "fn(url: string, data: ?, config: obj) -> HttpPromise"
        },
        "put": {
          "!type": "fn(url: string, data: ?, config: obj) -> HttpPromise"
        },
        "delete": {
          "!type": "fn(url: string, config: obj) -> HttpPromise"
        },
        "jsonp": {
          "!type": "fn(url: string, config: obj) -> HttpPromise"
        }
      },
      "$injector": {
        "annotate": {
          "!type": "fn(fn: fn()) -> [string]"
        },
        "get": {
          "!type": "fn(name: string) -> ?"
        },
        "instantiate": {
          "!type": "fn(type: fn, locals: obj) -> obj"
        },
        "invoke": {
          "!type": "fn(fn: fn(), self: ?, locals: ?) -> ?"
        }
      },
      "$interpolateProvider": {
        "endSymbol": {
          "!type": "fn(value: string) -> string"
        },
        "startSymbol": {
          "!type": "fn(value: string) -> string"
        }
      },
      "$interpolate": {
        "!type": "fn(text: string, mustHaveExpresion: bool) -> fn(context: obj)"
      },
      "jQueryLite": {
        "!type": "[+Element]",
        "addClass": {
          "!type": "fn(className: string) -> jQueryLite"
        },
        "after": {
          "!type": "fn(content: ?) -> jQueryLite"
        },
        "append": {
          "!type": "fn(content: ?) -> jQueryLite"
        },
        "attr": {
          "!type": "fn(name: string, value?: string) -> jQueryLite"
        },
        "bind": {
          "!type": "fn(eventType: string, handler: fn(e: +Event)) -> jQueryLite"
        },
        "children": {
          "!type": "fn() -> jQueryLite"
        },
        "clone": {
          "!type": "fn(dataAndEvents?: bool, deep?: bool) -> jQueryLite"
        },
        "contents": {
          "!type": "fn() -> jQueryLite"
        },
        "css": {
          "!type": "fn(name: string, value?: string) -> jQueryLite"
        },
        "data": {
          "!type": "fn(key: string, value?: ?) -> !1"
        },
        "eq": {
          "!type": "fn(i: number) -> jQueryLite"
        },
        "find": {
          "!type": "fn(tagName: string) -> jQueryLite"
        },
        "hasClass": {
          "!type": "fn(className: string) -> bool"
        },
        "html": {
          "!type": "fn() -> string"
        },
        "next": {
          "!type": "fn() -> jQueryLite"
        },
        "parent": {
          "!type": "fn() -> jQueryLite"
        },
        "prepend": {
          "!type": "fn(content: ?) -> jQueryLite"
        },
        "prop": {
          "!type": "fn(name: string, value?: string) -> string"
        },
        "ready": {
          "!type": "fn(fn: fn()) -> jQueryLite"
        },
        "remove": {
          "!type": "fn(selector?: string) -> jQueryLite"
        },
        "removeAttr": {
          "!type": "fn(attrName: string) -> jQueryLite"
        },
        "removeClass": {
          "!type": "fn(className?: string) -> jQueryLite"
        },
        "removeData": {
          "!type": "fn(name?: string) -> jQueryLite"
        },
        "replaceWith": {
          "!type": "fn(newContent: ?) -> jQueryLite"
        },
        "text": {
          "!type": "fn() -> string"
        },
        "toggleClass": {
          "!type": "fn(duration?: number, complete?: fn()) -> jQueryLite"
        },
        "triggerHandler": {
          "!type": "fn(eventType: string, params: ?) -> jQueryLite"
        },
        "unbind": {
          "!type": "fn(eventType?: string, handler?: fn()) -> jQueryLite"
        },
        "val": {
          "!type": "fn() -> string"
        },
        "wrap": {
          "!type": "fn(wrappingElement: ?) -> jQueryLite"
        }
      },
      "$locale": {
        "id": {
          "!type": "string"
        }
      },
      "module": {
        "!type": "fn(modName: string, modParams: ?) -> module",
        "config": {
          "!type": "fn(configFn: fn()) -> module"
        },
        "constant": {
          "!type": "fn(name: string, obj: obj) -> !custom:ngReturnValInject",
          "!effects": ["call and return module"]
        },
        "controller": {
          "!type": "fn(name: string, constructor: fn(args?: ?)) -> !custom:ngInject",
          "!effects": ["call and return module"]
        },
        "directive": {
          "!type": "fn(name: string, directiveFactory: ?) -> !custom:ngDirectiveInject",
          "!effects": ["call and return module"]
        },
        "factory": {
          "!type": "fn(factoryName: string, provider: ?) -> !custom:ngReturnValInject",
          "!effects": ["call and return module"]
        },
        "filter": {
          "!type": "fn(name: string, filterFactory: fn()) -> !custom:ngReturnValInject",
          "!effects": ["call and return module"]
        },
        "provider": {
          "!type": "fn(name: string, providerType: fn()) -> module"
        },
        "run": {
          "!type": "fn(initializationFn: fn()) -> module"
        },
        "service": {
          "!type": "fn(name: string, constructor: ?) -> !custom:ngServiceInject",
          "!effects": ["call and return module"]
        },
        "value": {
          "!type": "fn(name: string, obj: ?) -> !custom:ngValueInject",
          "!effects": ["call and return module"]
        },
        "name": {
          "!type": "string"
        },
        "requires": {
          "!type": "[string]"
        }
      },
      "Promise": {
        "then": {
          "!type": "fn(successCallback: fn(), errorCallback: fn()) -> Promise"
        }
      },
      "$provider": {
        "constant": {
          "!type": "fn(name: string, value: ?) -> obj: obj"
        },
        "decorator": {
          "!type": "fn(name: string, decorator: fn())"
        },
        "factory": {
          "!type": "fn(name: string, $getFn: fn()) -> ?",
          "!effects": ["custom ngReturnValInject"]
        },
        "service": {
          "!type": "fn(name: string, constructor: fn()) -> ?"
        },
        "value": {
          "!type": "fn(name: string, value: ?) -> ?"
        }
      },
      "$q": {
        "defer": {
          "!type": "fn() -> Deferred"
        }
      },
      "ResourceClass": {
        "get": {
          "!type": "fn(method: string)"
        },
        "save": {
          "!type": "fn(method: string)"
        },
        "query": {
          "!type": "fn(method: string, isArray: bool)"
        },
        "remove": {
          "!type": "fn(method: string)"
        },
        "delete": {
          "!type": "fn(method: string)"
        }
      },
      "$resource": {
        "!proto": "ResourceClass",
        "!type": "fn(url: string, paramDefaults?: ?) -> +$resource"
      },
      "$rootElement": {
        "!proto": "jQueryLite"
      },
      "$rootScope": {
        "!proto": "Scope"
      },
      "$sce": {
        "getTrusted": {
          "!type": "fn(type: string, maybeTrusted: ?)"
        },
        "getTrustedCss": {
          "!type": "fn(value: ?)"
        },
        "getTrustedHtml": {
          "!type": "fn(value: ?)"
        },
        "getTrustedJs": {
          "!type": "fn(value: ?)"
        },
        "getTrustedResourceUrl": {
          "!type": "fn(value: ?)"
        },
        "getTrustedUrl": {
          "!type": "fn(value: ?)"
        },
        "parse": {
          "!type": "fn(type: string, expression: string) -> fn(context: obj, locals: obj)"
        },
        "parseAsCss": {
          "!type": "fn(expression: string) -> fn(context: obj, locals: obj)"
        },
        "parseAsJs": {
          "!type": "fn(expression: string) -> fn(context: obj, locals: obj)"
        },
        "parseAsResourceUrl": {
          "!type": "fn(expression: string) -> fn(context: obj, locals: obj)"
        },
        "parseAsUrl": {
          "!type": "fn(expression: string) -> fn(context: obj, locals: obj)"
        },
        "trustAs": {
          "!type": "fn(type: string, value: ?)"
        },
        "trustAsHtml": {
          "!type": "fn(value: ?) -> obj"
        },
        "trustAsJs": {
          "!type": "fn(value: ?) -> obj"
        },
        "trustAsResourceUrl": {
          "!type": "fn(value: ?) -> obj"
        },
        "trustAsUrl": {
          "!type": "fn(value: ?) -> obj"
        },
        "isEnabled": {
          "!type": "fn() -> bool"
        }
      },
      "$sceDelegate": {
        "getTrusted": {
          "!type": "fn(type: string, maybeTrusted: ?)"
        },
        "trustAs": {
          "!type": "fn(type: string, value: ?)"
        },
        "valueOf": {
          "!type": "fn(value: ?)"
        }
      },
      "$scope": {
        "!proto": "Scope"
      },
      "$templateCache": {
        "put": {
          "!type": "fn(templateID: string, templateContent: string)"
        },
        "get": {
          "!type": "fn(templateID: string) -> string"
        }
      },
      "$timeout": {
        "!type": "fn(fun: fn, delay: number, invokeApply: bool) -> $q"
      },
      "$swipe": {
        "bind": {
          "!type": "fn(element: jQueryLite, handlersObj: obj)"
        }
      },
      "Scope": {
        "$apply": {
          "!type": "fn(exp?: ?)"
        },
        "$broadcast": {
          "!type": "fn(name: string, args?: ?) -> +EmitEvent"
        },
        "$destroy": {
          "!type": "fn()"
        },
        "$digest": {
          "!type": "fn()"
        },
        "$emit": {
          "!type": "fn(name: string, args?: ?) -> +EmitEvent"
        },
        "$eval": {
          "!type": "fn(exp: ?) -> ?"
        },
        "$evalAsync": {
          "!type": "fn(exp?: ?)"
        },
        "$new": {
          "!type": "fn(isolate: bool) -> Scope"
        },
        "$on": {
          "!type": "fn(name: string, listener: fn(e: EmitEvent, args?: ?)) -> fn()"
        },
        "$watch": {
          "!type": "fn(watchExpression: ?, listener?: fn(new: ?, old: ?), objectEquality?: bool) -> fn()"
        },
        "$id": {
          "!type": "number"
        }
      },
      "Attrs": {
        "$set": {
          "!type": "fn(name: string, value: string)"
        },
        "$attr": {}
      },
      "version": {
        "full": {
          "!type": "string"
        },
        "major": {
          "!type": "number"
        },
        "minor": {
          "!type": "number"
        },
        "dot": {
          "!type": "number"
        },
        "codeName": {
          "!type": "string"
        }
      },
      "$window": {

      }
    },
    "angular": {
      "module": "module",
      "element": {
        "!type": "fn(elem: ?) -> jQueryLite"
      },
      "bind": {
        "!type": "fn(self: ?, fn: fn(), args: ?) -> fn()"
      },
      "bootstrap": {
        "!type": "fn(element: +Element, modules: []) -> $injector"
      },
      "copy": {
        "!type": "fn(source: ?, destination: ?) -> !0",
        "!effects": ["copy !1 !0"]
      },
      "equals": {
        "!type": "fn(o1: ?, o2: ?) -> bool"
      },
      "extend": {
        "!type": "fn(dst: ?, src: ?) -> !0",
        "!effects": ["copy !1 !0"]
      },
      "forEach": {
        "!type": "fn(collection: ?, callback: fn(value: ?, key: ?), context?: ?) -> !0",
        "!effects": ["call !1 this=!2"]
         },
      "fromJson": {
        "!type": "fn(json: string) -> ?"
      },
      "identity": {
        "!type": "fn(arg: ?) -> ?"
      },
      "injector": {
        "!type": "fn(modules: []) -> $injector"
      },
      "isArray": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isDate": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isDefined": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isElement": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isFunction": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isNumber": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isObject": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isString": {
        "!type": "fn(ref: ?) -> bool"
      },
      "isUndefined": {
        "!type": "fn(ref: ?) -> bool"
      },
      "lowercase": {
        "!type": "fn(str: string) -> string"
      },
      "mock": {
        "dump": {
          "!type": "fn(obj: obj) -> string"
        },
        "inject": {
          "!type": "$inject"
        },
        "module": {
          "!type": "fn(fns: ?)"
        }
      },
      "noop": {
        "!type": "fn() -> fn()"
      },
      "toJson": {
        "!type": "fn(obj: obj, pretty: bool) -> string"
      },
      "uppercase": {
        "!type": "fn(str: string) -> string"
      },
      "version": {
        "!type": "version"
      }
    }
  };
});
