export type ScopeDescriptorType = 'route' | 'state' | 'when';

export type DslFn = (this: RouterDsl, arg?: any) => void;
export type RouteDescriptorArgs = RouteDescriptorOptions | DslFn;

export interface ScopeDescriptor {
  name: string;
  type: ScopeDescriptorType;
  buildBlockParam(scope: MapScope, index: number) : any;
  computeKey(params: any) : string;
}

export interface RouteDescriptorOptions {
  path?: string;
  key?: string;
}

const PARAMS_REGEX = /([:*][a-z_]+)/g;
export class RouteDescriptor implements ScopeDescriptor {
  name: string;
  options: RouteDescriptorOptions;
  type: ScopeDescriptorType;
  path: string;
  paramNames: string[];

  constructor(name, options, childrenDesc) {
    this.name = name;
    this.options = options;
    this.type = 'route';
    this.path = options.path || '/';
    this.paramNames = (this.path.match(PARAMS_REGEX) || []).map(s => s.slice(1));
  }

  buildBlockParam(scope: MapScope, index: number) {
    return { scope };
  }

  computeKey(params: any) : string {
    return `${this.name}_${this.paramNames.map(p => params[p]).join('_')}`;
  }
}

export interface StateDescriptorOptions {
  key?: string;
}

export class StateDescriptor implements ScopeDescriptor {
  name: string;
  options: StateDescriptorOptions;
  type: ScopeDescriptorType;

  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.type = 'state';
  }

  buildBlockParam(scope: MapScope, index: number) {
    return {
      match: (conditionObj: any, fn: MapChildrenFn) => {
        return new WhenDescriptor(conditionObj, scope, fn);
      }
    };
  }

  computeKey(params: any) : string {
    return 'route-key'
  }
}

export class WhenDescriptor implements ScopeDescriptor {
  name: string;
  childrenDesc: MapChildrenFn;
  type: ScopeDescriptorType;
  condition: any;
  source: MapScope;

  constructor(condition: any, source: MapScope, childrenDesc) {
    this.name = 'when';
    this.childrenDesc = childrenDesc;
    this.type = 'when';
    this.source = source;
    this.condition = condition;
  }

  buildBlockParam(scope: MapScope, index: number) {
    return { scope };
  }

  computeKey(params: any) : string {
    return 'route-key'
  }
}

const nullChildrenFn = () => [];

export interface HandlerInfo {
  handler: any;
}

export type MapChildrenFn = (blockParams?: any) => ScopeDescriptor[];

export class MapScope {
  childScopes: MapScope[];
  desc: ScopeDescriptor;
  childScopeRegistry: {
    [key: string]: MapScope
  };
  pathKey: string;

  constructor(desc: ScopeDescriptor, public parent: MapScope | null, public index: number) {
    this.desc = desc;
    this.childScopes = [];
    this.childScopeRegistry = {};
    if (parent) {
      this.pathKey = `${parent.pathKey}_${index}`;
    } else {
      this.pathKey = `${index}`;
    }
  }

  _registerScope(scope: MapScope) {
    this.childScopeRegistry[scope.name] = scope;
    if (this.parent) {
      this.parent._registerScope(scope);
    }
  }

  getScope(name: string) : MapScope | undefined {
    return this.childScopeRegistry[name];
  }

  computeKey(params: any) : string {
    return `${this.pathKey}$${this.desc.computeKey(params)}`;
  }

  get name() : string {
    return this.desc.name;
  }

  get type() : string {
    return this.desc.type;
  }
}

interface RouteReduction {
  scope: MapScope;
  children: RouteReduction[];
}

function makeRouterDslFn(rr: RouteReduction) {
  if (rr.children.length) {
    return function(this: any) {
      let emberRouterDsl = this;
      rr.children.forEach((childRr, index) => {
        let rdesc = childRr.scope.desc as RouteDescriptor;

        // TODO: provide default path for non resetNamespace fully qualified route names
        let options = Object.assign({ resetNamespace: true }, rdesc.options);
        emberRouterDsl.route(rdesc.name, options, makeRouterDslFn(childRr));
      });
    }
  }
}

export class Map {
  root: MapScope;

  constructor() {
    let rootDesc = new RouteDescriptor('root', { path: '/' }, null);
    this.root = new MapScope(rootDesc, null, 0);
  }

  getScope(name: string) {
    return this.root.getScope(name);
  }

  getScopePath(name: string) : MapScope[] {
    let leaf = this.getScope(name);
    if (!leaf) { return []; }
    let path: MapScope[] = [];
    let scope: MapScope | undefined | null = leaf;
    while (scope) {
      path.push(scope);
      scope = scope.parent;
    }
    return path.reverse();
  }

  mount(emberRouterDsl) {
    let rootRoutes: any[] = [];
    this._reduceToRouteTree(rootRoutes, this.root);
    makeRouterDslFn({ scope: this.root, children: rootRoutes })!.call(emberRouterDsl);
  }

  _reduceToRouteTree(routes: any[], scope: MapScope) {
    scope.childScopes.forEach((cs) => {
      if (cs.type === 'route') {
        let childRoutes = [];
        this._reduceToRouteTree(childRoutes, cs);
        routes.push({ scope: cs, children: childRoutes });
      } else {
        this._reduceToRouteTree(routes, cs);
      }
    });
  }

  forEach(callback: (MapScope) => any) {
    this._forEach(this.root, callback);
  }

  _forEach(mapScope: MapScope, callback: (MapScope) => any) {
    callback(mapScope);
    mapScope.childScopes.forEach(ms => this._forEach(ms, callback));
  }
}

export interface RouterDsl {
  route(name: string, options?: RouteDescriptorArgs, callback?: DslFn) : any;
  state(name: string, options?: RouteDescriptorArgs, callback?: DslFn) : any;
  match(blockParam: any, cond: string, callback: DslFn) : any;
}

class RouterDslScope implements RouterDsl {
  scope: MapScope;

  constructor(scope: MapScope) {
    this.scope = scope;
  }

  route(name: string, options: RouteDescriptorArgs = {}, callback?: DslFn): any {
    if (arguments.length === 2 && typeof options === 'function') {
      callback = options;
      options = {}
    }

    let desc = new RouteDescriptor(name, options, callback);
    let index = this.scope.childScopes.length;
    let childScope = new MapScope(desc, this.scope, index);
    this.scope._registerScope(childScope);

    if (callback) {
      let childDslScope = new RouterDslScope(childScope);
      callback.call(childDslScope);
    }

    this.scope.childScopes.push(childScope);
  }

  state(name: string, options: RouteDescriptorArgs = {}): MapScope {
    let desc = new StateDescriptor(name, options);
    let index = this.scope.childScopes.length;
    let childScope = new MapScope(desc, this.scope, index);
    this.scope._registerScope(childScope);
    this.scope.childScopes.push(childScope);
    return childScope;
  }

  match(blockParam: MapScope, cond: string, callback: DslFn) {
    let desc = new WhenDescriptor(cond, blockParam, callback);

    let index = this.scope.childScopes.length;
    let childScope = new MapScope(desc, this.scope, index);

    if (callback) {
      let childDslScope = new RouterDslScope(childScope);
      callback.call(childDslScope);
    }

    this.scope.childScopes.push(childScope);
  }
}

export function createMap(callback: DslFn) : Map {
  let map = new Map();
  let rootDslScope = new RouterDslScope(map.root);
  callback.call(rootDslScope);
  return map;
}