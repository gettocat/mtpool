let { WorkerApp } = require('../lib/index');

class Worker2 extends WorkerApp {
    constructor(cb) {
        super(cb);
    }
    init() {
        return new Promise((resolve, reject) => {
            resolve();
        })
    }
    processTask(taskdata) {
        //process task task.data
        //console.log('worker id', this.id, 'process task', taskdata)
        return this.request('getRandomData', { index: this.id })
            .then((result) => {
                this.debug('response from pool for workerId ' + this.id + ' random data' + result);
                return Promise.resolve(result)
            })
            .then((res) => {
                return res + taskdata.param1 + taskdata.param2;
            })
    }
}

let worker = new Worker2();
worker.start();