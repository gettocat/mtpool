let { Pool, WorkerEvent } = require("../lib/index");
let poolQueue = Promise.resolve();

let pool = new Pool('test1', 5, './test/worker1.js');

pool.on('debug', (arr) => {
    arr.unshift('pool1')
    console.log.apply(this, arr);
});

/*pool.on('workerEvent', ({ event, workerId }) => {
    if (event.name == 'processed') {
        console.log('worker processed', workerId, event.data)
    }
});*/

pool.on('workerProcessed', ({ workerId, data }) => {
    console.log('worker processed', workerId, data)
})

pool.on('workerRequest', ({ event, workerId, callback }) => {
    this[event.data.method].apply(this, event.data.params)
        .then((response) => {

            callback(response);

        });
});

pool.on('ready', () => {
    //start work
    //all workers inited

    for (let i = 0; i <= 100; i++) {
        pool.addToQueue({ id: i, param1: i, param2: i });
    }
});

pool.on('queue', (count) => {
    console.log('pool queue', count);
})

pool.on('empty', () => {
    console.log('queue is empty now');
    pool.terminateWorkers();
})

