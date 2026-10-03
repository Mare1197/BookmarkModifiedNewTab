import {browser} from 'wxt/browser';
import type {WorkspaceTask} from '../../workspace/types';

const TASK_REMINDERS_KEY = 'browserOsTaskRemindersV1';

export async function syncTaskReminder(task: WorkspaceTask, title: string): Promise<void> {
    const alarmName = 'workspace-task:' + task.id;
    const stored = await browser.storage.local.get(TASK_REMINDERS_KEY);
    const reminders = (stored[TASK_REMINDERS_KEY] as Record<string, {title: string}> | undefined) || {};
    if (task.reminderAt && task.reminderAt > Date.now() && task.status !== 'done') {
        reminders[task.id] = {title};
        await browser.alarms.create(alarmName, {when: task.reminderAt});
    } else {
        delete reminders[task.id];
        await browser.alarms.clear(alarmName);
    }
    await browser.storage.local.set({[TASK_REMINDERS_KEY]: reminders});
}
