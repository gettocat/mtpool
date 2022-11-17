import EventEmitter = require('events');
import { parentPort } from 'worker_threads';
import crypto = require('crypto');
import { WorkerEvent } from './workerevent';

export class WorkerApp extends EventEmitter {
  id: string | number;
  queue: Promise<void | {}>;

  constructor() {
    super();
    this.queue = Promise.resolve();
  }
  init() {
    return Promise.resolve();
  }
  start() {
    this.init().then(() => {
      parentPort.on('message', (e) => {
        const evt = WorkerEvent.fromJSON(e);
        this.responseHandler(evt);
      });
    });
  }
  /**
   * Process task and return Promise. Must be reimplemented in child class.
   * @param data
   */
  processTask(data: any): Promise<any> {
    throw new Error('must be implemented');
  }
  /**
   * Request to pool from this worker.
   * @param method Method of request
   * @param params params can be any type
   * @param timeout in ms. Default - 5000 ms
   * @returns
   */
  request(method: string, params: any, timeout: number = 5000) {
    if (timeout < 1000) timeout = 1000;
    return new Promise((resolve, reject) => {
      const id = crypto.randomBytes(8).toString('hex');
      const tm = setTimeout(() => {
        reject('Error while request to pool of worker. Timeout.');
      }, timeout);
      this.on('ask-response' + id, (response) => {
        clearTimeout(tm);
        resolve(response);
      });
      this.sendToPool(new WorkerEvent('ask', id, { method, params }));
    });
  }
  /**
   * Send event to pool
   * @param event
   */
  sendToPool(event: WorkerEvent): void {
    parentPort.postMessage(event);
  }
  private responseHandler(e: any) {
    const event = WorkerEvent.fromJSON(e);

    if (event.name === 'ask') {
      this.emit('ask-response' + event.id, event.data);
    }

    if (event.name === 'init') {
      this.debug('inited');
      this.id = event.id;
      this.sendToPool(new WorkerEvent('inited'));
    }

    if (event.name === 'addToQueue') {
      this.queue = this.queue
        .then(() => {
          return this.processTask(event.data);
        })
        .then((response) => {
          this.sendToPool(new WorkerEvent('processed', event.id, response));
          return Promise.resolve();
        })
        .catch((err) => {
          this.debug('task processed with error', err);
          this.sendToPool(
            new WorkerEvent('processed', event.id, { error: true, errorMessage: err.message, errorCode: err.code }),
          );
          return Promise.resolve();
        });
    }
  }
  private debug(message: string, status: string = '') {
    if (!status) status = 'debug';

    this.sendToPool(new WorkerEvent('log', 'debug', { status, message }));
  }
}
