export type TaskData = {
  status: any;
  message: any;
};

export class WorkerEvent {
  id: string | number;
  name: string;
  data: any;

  constructor(name: string, id: string | number = '', data: any = {}) {
    this.id = id;
    this.name = name;
    this.data = data;
  }
  static fromJSON(data: any): WorkerEvent {
    return new WorkerEvent(data.name, data.id, data.data);
  }
}
