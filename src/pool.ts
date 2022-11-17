import EventEmitter = require('events');
import { PoolStats } from './poolstats';
import { Worker } from 'worker_threads';
import { Task } from './task';
import { WorkerEvent } from './workerevent';
type EventCallback = (...a: any[]) => void;

export class Pool extends EventEmitter {
  poolName: string;
  //
  ebMinDelay: number;
  ebMaxDelay: number;
  ebDelayFactor: number;
  ebDelayJitter: number;
  ebTime: { [index: number]: number };
  //
  workerFilename: string;
  workerCount: number;
  workerInited: number;
  workerList: { [index: number]: Worker };
  workerOnData: EventCallback;
  //
  queueStats: { [index: number]: PoolStats };
  queueLimit: number;
  queue: Task[];

  /**
   * Creating new pool.
   * @param poolName name of new pool
   * @param workerCount more then 1
   * @param workerFilename required
   * @param workerOnData event handler
   */
  constructor(poolName: string, workerCount: number, workerFilename: string, workerOnData: EventCallback | null) {
    super();

    this.poolName = poolName;

    this.ebMinDelay = 500;
    this.ebMaxDelay = 10000;
    this.ebDelayFactor = 2;
    this.ebDelayJitter = 0.1;
    this.ebTime = [];

    this.queueLimit = 10; // count of tasks in worker queue in one time.
    this.queueStats = [];
    this.queue = [];

    this.workerList = [];
    this.workerFilename = workerFilename;
    if (!workerFilename) throw new Error('worker filename is required');
    this.workerCount = workerCount || 1;
    this.workerOnData = workerOnData;
    this.workerInited = 0;

    this.on('inited', (workerIndex: number) => {
      this.workerInited++;
      this.debug('inited workers', this.workerInited);
      if (this.workerInited === this.workerCount) {
        this.workerInited = 0;
        this.emit('ready');
      }
    });

    this.on('queue', (count: number) => {
      if (count !== 0) return;

      for (let i = 0; i < this.workerCount; i++) {
        if (this.queueStats[i].queue !== 0) return;
      }

      this.emit('empty');
    });

    this.createWorkers();
  }
  /**
   * Add new workers to pool and start them
   * @param count number
   */
  incrementWorkerCount(count: number) {
    this.workerCount += count;
    this.appendWorkers();
  }
  /**
   * Remove workers from pool and terminate them. You can loose worker job in this method!
   * @param count number
   */
  decrementWorkerCount(count: number) {
    if (count < this.workerCount) this.workerCount -= count;
    else this.workerCount = 1;

    this.terminateWorkers(true);
    this.appendWorkers();
  }
  private createWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      this.createWorker(i);
    }
  }
  /**
   * Terminate workers.
   * @param force Only if this param is true - you can terminate worker in progress, else throw error.
   * @returns
   */
  terminateWorkers(force: boolean = false): Promise<any[]> {
    const all = [];

    for (let i = 0; i < this.workerCount; i++) {
      if (this.queueStats[i].queue !== 0 && !force) throw new Error('can not terminate workers while they do work');
    }

    for (let i = 0; i < this.workerCount; i++) {
      this.workerList[i].removeAllListeners('exit');
      all.push(this.workerList[i].terminate());
    }

    return Promise.all(all);
  }
  private appendWorkers(): void {
    for (let i = 0; i < this.workerCount; i++) {
      if (!this.workerList[i]) this.createWorker(i);
    }
  }
  private createWorker(index: number, recreate: boolean = false): void {
    if (!recreate) this.ebTime[index] = this.ebMinDelay;

    const worker = new Worker(this.workerFilename);

    worker.on('error', (e) => {
      this.debug('worker error', e);
    });

    worker.on('exit', (code) => {
      if (code !== 0) this.debug('worker stopped with code ', code);

      const delay = Math.min(this.ebTime[index] * this.ebDelayFactor, this.ebMaxDelay);
      this.ebTime[index] = delay + Math.random() * delay * this.ebDelayJitter;

      setTimeout(() => {
        this.debug('recreate worker ', this.ebTime[index], 'ms');
        worker.terminate().then(() => {
          this.createWorker(index, true);
        });
      }, this.ebTime[index]);
    });

    worker.postMessage(new WorkerEvent('init', index));
    worker.on('message', (e) => {
      const evt = WorkerEvent.fromJSON(e);
      if (evt.name === 'inited') {
        this.queueStats[index].lastProcessed = Date.now() / 1000;
        this.queueStats[index].avgTimePerSecond = 0;
        this.emit('inited', index);
      }

      if (evt.name === 'processed') {
        if (this.ebTime[index] > this.ebMinDelay) this.ebTime[index] = this.ebMinDelay;

        this.queueStats[index].queue--;

        this.queueStats[index].avgTimePerSecond = 60 / (1 + (Date.now() / 1000 - this.queueStats[index].lastProcessed));
        this.queueStats[index].lastProcessed = Date.now() / 1000;
        this.debug(
          'processed task ' + evt.id + ' from worker: ',
          index,
          ', queue count: ',
          this.queueStats[index].queue,
          'speed:',
          this.queueStats[index].avgTimePerSecond,
          'task/sec',
        );
        this.emit('workerProcessed', { data: evt.data, workerId: index });
        this.emit('workerQueue', { workerId: index, count: this.queueStats[index].queue });
        this.updateWorkerQueue(index);
      }

      if (evt.name === 'log') {
        this.debug('/', 'worker #' + index, evt.data.status, '/', evt.data.message);
      }

      if (evt.name === 'ask') {
        const callback = (response: any) => {
          this.sendToWorker(index, new WorkerEvent('ask', evt.id, response));
        };

        this.emit('workerRequest', { event: evt, workerId: index, callback });
      }

      if (this.workerOnData) this.workerOnData.apply(this, [evt, index]);
      this.emit('workerEvent', { event: evt, workerId: index });
    });

    this.queueStats[index] = { queue: 0, lastProcessed: 0, avgTimePerSecond: 0 };
    this.debug(recreate ? 'recreate worker' : 'add worker ', index);
    this.workerList[index] = worker;
  }
  private getMinQueue() {
    let min = Number.MAX_SAFE_INTEGER;
    let minIndex = 0;

    for (const i in this.queueStats) {
      if (this.queueStats[i].queue <= min) {
        min = this.queueStats[i].queue;
        minIndex = parseInt(i, 10);
      }
    }

    if (min > this.queueLimit * 0.7) return -1;

    return minIndex;
  }
  /**
   * Send event to worker
   * @param index workerNumber
   * @param data eventObject
   */
  sendToWorker(index: number, data: WorkerEvent) {
    this.workerList[index].postMessage(data);
  }
  /**
   * Send task to queue
   * @param task can be any data type (cast to WorkerEvent)
   * @param processor Function, that can handle data. Executing on worker side. Only for simple tasks. Can not send context of function to worker.
   */
  addToQueue(task: Task | any) {
    if (!(task instanceof WorkerEvent)) {
      task = new WorkerEvent('addToQueue', task.id || 0, task);
    }

    const index = this.getMinQueue();
    if (index === -1) {
      // queues of workers is full, add to pool queue
      this.queue.push(task);
      this.emit('queue', this.queue.length);
      this.debug('workers are busy, add message ' + task.id + ' to pool', this.queue.length);
    } else {
      this.sendToWorker(index, task);
      this.queueStats[index].queue++;
      this.debug(
        'add message ' + task.id + ' to worker: ',
        index,
        ', queue count: ',
        this.queueStats[index].queue,
        ', speed: ',
        this.queueStats[index].avgTimePerSecond,
        ' task/sec',
      );
    }
  }
  private updateWorkerQueue(index: number) {
    const q = this.queueStats[index].queue;

    if (!this.queue.length) this.emit('queue', this.queue.length);

    if (q <= this.queueLimit * 0.7) {
      for (let i = q; i < this.queueLimit; i++) {
        if (!this.queue.length) {
          continue;
        }
        const task: Task = this.queue.shift();
        this.emit('queue', this.queue.length);
        this.sendToWorker(index, task);
        this.queueStats[index].queue++;
        this.emit('workerQueue', { workerId: index, count: this.queueStats[index].queue });
        this.debug(
          'add message ' + task.id + ' to worker: ',
          index,
          ', queue count: ',
          this.queueStats[index].queue,
          ', speed: ',
          this.queueStats[index].avgTimePerSecond,
          ' task/sec',
          'common queue ',
          this.queue.length,
        );
      }
    }
  }
  /**
   * Returns statistics for workers
   * @returns PoolStats
   */
  getStats(): { [index: number]: PoolStats } {
    return this.queueStats;
  }
  private debug(...rest: any[]): void {
    const arr = Array.from(rest);
    arr.unshift('< ' + this.poolName + ' >');
    arr.unshift('[' + new Date().toLocaleTimeString() + ']');
    this.emit('debug', arr);
  }
}
