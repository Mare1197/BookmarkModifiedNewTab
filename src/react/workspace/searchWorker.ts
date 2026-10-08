import {workspaceClient} from './workspaceDatabase';
import {createSearchWorkerRuntime} from './searchWorkerRuntime';
const runtime = createSearchWorkerRuntime(workspaceClient, response => globalThis.postMessage(response));
globalThis.onmessage = event => {void runtime.handle(event.data);};
