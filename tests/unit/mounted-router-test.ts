import { test, module } from 'ember-qunit';
import { route, switchRouter, stackRouter } from 'ember-constraint-router';
import { _TESTING_ONLY_normalize_keys } from 'ember-constraint-router/-private/key-generator';
import MountedRouter from 'ember-constraint-router/-private/mounted-router';
import { Resolver } from 'ember-constraint-router/-private/routeable';
import { PublicRoute } from 'ember-constraint-router/-private/public-route';

function buildTestResolver() {
  let events: any[] = [];
  let delegateId = 0;

  class Route extends PublicRoute {
    id: number = delegateId++;

    update(_state: any) {
      events.push({ id: this.id, type: "update", key: this.node.key});
    }

    unmount() {
      events.push({ id: this.id, type: "unmount", key: this.node.key});
    }

    mount() {
      events.push({ id: this.id, type: "mount", key: this.node.key});
    }

    focus() {
    }

    blur() {
    }
  }

  class TestResolver implements Resolver {
    delegates: any[];
    id: number;
    constructor() {
      this.delegates = [];
      this.id = 0;
    }

    resolve() {
      return Route;
    }
  }
  let resolver = new TestResolver();

  return { resolver, events };
}

module('Unit - MountedRouter test', function(hooks) {
  hooks.beforeEach(() => _TESTING_ONLY_normalize_keys());

  test("initial state is kind of moronic", function (assert) {
    let router = switchRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    assert.deepEqual(events, [
      {
        "id": 1,
        "key": "foo",
        "type": "update"
      },
      {
        "id": 0,
        "key": "SwitchRouterBase",
        "type": "update"
      }
    ]);
  });

  test("switch: navigation enters/updates the new route and unmounts the old one", function (assert) {
    let router = switchRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    events.length = 0;
    mountedRouter.navigate({ routeName: 'bar' })
    assert.deepEqual(events, [
      {
        "id": 2,
        "key": "bar",
        "type": "update"
      },
      {
        "id": 1,
        "key": "foo",
        "type": "unmount"
      },
      {
        "id": 0,
        "key": "SwitchRouterBase",
        "type": "update"
      }
    ]);
  });

  test("no-op navigations result in zero changes/lifecycle events", function (assert) {
    let router = switchRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    events.length = 0;
    mountedRouter.navigate({ routeName: 'foo' })
    assert.deepEqual(events, []);
  });

  test("stack: initial state", function (assert) {
    let router = stackRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    assert.deepEqual(events, [
      {
        "id": 1,
        "key": "id-0",
        "type": "update"
      },
      {
        "id": 0,
        "key": "StackRouterRoot",
        "type": "update"
      }
    ]);
  });

  test("stack: no-op", function (assert) {
    let router = stackRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    events.length = 0;
    mountedRouter.navigate({ routeName: 'foo' })
    assert.deepEqual(events, []);
  });

  test("stack: basic nav", function (assert) {
    let router = stackRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    events.length = 0;
    mountedRouter.navigate({ routeName: 'bar' })
    assert.deepEqual(events, [
      {
        "id": 2,
        "key": "id-2",
        "type": "update"
      },
      {
        "id": 0,
        "key": "StackRouterRoot",
        "type": "update"
      }
    ]);
  });

  test("stack: popping", function (assert) {
    let router = stackRouter('root', [
      route('foo'),
      route('bar'),
    ]);
    let { resolver, events } = buildTestResolver();
    let mountedRouter = new MountedRouter(router, resolver);
    mountedRouter.navigate({ routeName: 'bar' })
    events.length = 0;
    mountedRouter.navigate({ routeName: 'foo' })
    assert.deepEqual(events, [
      {
        "id": 2,
        "key": "id-2",
        "type": "unmount"
      },
      {
        "id": 0,
        "key": "StackRouterRoot",
        "type": "update"
      }
    ]);
  });
})
