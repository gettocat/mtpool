let { Pool, WorkerEvent } = require("../lib/index");
let poolQueue = Promise.resolve();

let pool = new Pool('test2', 2, './test/worker2.js');

pool.on('debug', (arr) => {
    console.log.apply(this, arr);
});

pool.on('workerProcessed', ({ workerId, data }) => {
    console.log('worker processed', workerId, data)
})

pool.on('workerRequest', ({ event, workerId, callback }) => {
    if (event.data.method == 'getRandomData') {
        console.log('ask from worker ' + workerId + ' random data', (event.data.params.index + 1) * 3);
        callback(event.data.params.index * 3);
    }
});

pool.on('ready', () => {
    //start work
    //all workers inited

    for (let i = 0; i <= 8; i++) {
        pool.addToQueue({ id: i, param1: i, param2: i });
    }
});


pool.on('empty', () => {
    pool.terminateWorkers();
})


