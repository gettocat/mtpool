import { TaskData, WorkerEvent } from './workerevent';

export class Task extends WorkerEvent {
  declare data: TaskData;
}
