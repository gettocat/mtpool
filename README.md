# MultiThreading Pool

##  Example

Create new pool
```js
const { Pool, WorkerEvent } = require("mtpool");
const pool = new Pool('simplePool', 2, './worker.js');

pool.on('debug', (arr) => {
    console.log.apply(this, arr);
});

pool.on('workerProcessed', ({ workerId, data }) => {
    console.log('worker processed', workerId, data);
})

pool.on('ready', () => {
    //start work
    //all workers inited

    for (let i = 0; i <= 100; i++) {
        pool.addToQueue({ id: i, param1: i, param2: i });
    }
});

pool.on('empty', () => {
    console.log('queue is empty now');
    pool.terminateWorkers();
})
```

And worker.js file, containing next:

```js
const { WorkerApp } = require('mtpool');

class Worker1 extends WorkerApp {
    constructor(cb) {
        super(cb);
    }
    init() {
        return new Promise((resolve, reject) => {
            resolve();
        })
    }
    processTask(taskdata) {
        return Promise.resolve(taskdata.param1 + taskdata.param2);
    }
}

new Worker1().start();
```

## Send request from worker to pool

Sometimes we need some info from pool, we can send request from worker with this code:

```js
//WorkerApp context
processTask(taskdata) {
    //process task task.data
    //console.log('worker id', this.id, 'process task', taskdata)
    return this.request('getInfoFromPool', { index: this.id, someanotherDataToPool: true })
        .then((result) => {
            this.debug('response from pool for workerId ' + this.id + ' random data' + result);
            return Promise.resolve(result)//result = event.data.params.index * 3
        })
        .then((res) => {
            return res + taskdata.param1 + taskdata.param2;
        })
}
```

and handle this request in pool by this event:
```js
//Pool context
pool.on('workerRequest', ({ event, workerId, callback }) => {
    if (event.data.method == 'getInfoFromPool') {
        if (event.data.params.someanotherDataToPool)
            console.log('ask from worker ' + workerId + ' random data', (event.data.params.index + 1) * 3);
        callback(event.data.params.index * 3);
    }
});
```

## Docs

### Pool Methods

```ts
new Pool(<poolName>, <workerCount>, <PathToWorkerFile>) // creating new pool 
```

```ts
pool.incrementWorkerCount(count) //add count workers to pool
```

```ts
pool.decrementWorkerCount(count) //remove count workers from pool.
```
*Caution: you can loose worker progress and worker queue, better use this method after pool event* `empty`

```ts
pool.terminateWorkers(force = false): Promise<any[]> //terminate workers
```
if `force` param is set to `true` - remove active workers with queue > 0. Else - throw Error if one of the worker have pending work.

```ts
pool.sendToWorker(index: number, data: WorkerEvent) //send event to worker from pool 
```

```ts
pool.addToQueue(task: Task | any) // add work to pool. 
```
Task can be any data, than will be sent to worker `processTask` method

```js
pool.getStats() // get pool workers stats
```

Type of stats records: 

```ts
class PoolStats {
  lastProcessed: number;
  avgTimePerSecond: number;
  queue: number;
}
```

### Pool Events

`ready` | `empty params` - fires when all workers inited with promise from `init` method in workerApp
`empty` | `empty params` - fires when queue of workers and pool queue is 0. No have work
`queue` | `count` - fires when pool queue updating
`workerQueue` | ` { workerId, count } ` fires when worker queue updating
`workerEvent` | `{ event, workerId }` - fires when some event sending from worker
`workerRequest` | `{ event, workerId, callback }` - fires when worker send request from workerApp (with `WorkerApp.request` method). After pool handle this request, handler must call  `callback(response)`.
`workerProcessed` | `{ data, workerId }` - fires when task processed by worker. 
`inited` | `workerIndex` - fires when worker inited
`debug` | `[poolName, Date, ...debugInfo]` - get debug information from pool and workers 

### WorkerApp methods

```js 
worker.start() // start worker
```

```js
worker.init() 
```
Must be reimplemented in child class. And must return Promise. WorkerApp invoke this method after start, and when promise is done - send `init` event to pool.

```js
worker.processTask()
```
Must be reimplemented in child class. And must return Promise. WorkerApp invoke this method when new task received from pool, and when promise is done - send `workerEvent(name='processed')` event to pool.

```js
worker.request('method', data); // send method and data to pool. Return Promise<response>.
```