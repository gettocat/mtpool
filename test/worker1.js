let { WorkerApp } = require('../lib/index');

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
        //process task task.data
        //console.log('worker id', this.id, 'process task', taskdata)
        return Promise.resolve(taskdata.param1 + taskdata.param2);
    }
}

new Worker1().start();