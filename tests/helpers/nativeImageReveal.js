// Runs inside the extension page so all browser timestamps share the app trace clock.
function installNativeImageReveal({editor, placementId}) {
    const host = document.querySelector('.affineNativeHost');
    const selector = `${editor} [data-placement-id="${CSS.escape(placementId)}"] img`;
    const scrollRequestedAt = performance.now();
    const alreadyAttached = Boolean(host.querySelector(selector));
    let firstObservedAt = alreadyAttached ? scrollRequestedAt : null;
    let scrollCompletedAt = null, droppedLongTasks = 0;
    const longTasks = [];
    const observeImage = () => {
        if (firstObservedAt === null && host.querySelector(selector)) firstObservedAt = performance.now();
    };
    const mutations = new MutationObserver(() => {
        observeImage();
        if (firstObservedAt !== null) mutations.disconnect();
    });
    if (!alreadyAttached) mutations.observe(host, {childList: true, subtree: true});
    const collectLongTasks = entries => {
        for (const {startTime, duration} of entries) {
            if (startTime + duration <= scrollRequestedAt) continue;
            longTasks.push({startTime, duration});
            if (longTasks.length > 200) {longTasks.shift(); droppedLongTasks++;}
        }
    };
    const tasks = new PerformanceObserver(list => collectLongTasks(list.getEntries()));
    tasks.observe({type: 'longtask', buffered: true});

    window.nativeImageRevealProbe = {
        markScrollComplete() {scrollCompletedAt = performance.now(); return scrollCompletedAt;},
        finish() {
            const capturedAt = performance.now();
            collectLongTasks(tasks.takeRecords());
            tasks.disconnect();
            mutations.disconnect();
            delete window.nativeImageRevealProbe;
            return {editor, placementId, scrollRequestedAt, scrollCompletedAt, capturedAt,
                alreadyAttached, firstObservedAt, attachedAtCapture: Boolean(host.querySelector(selector)), longTasks, droppedLongTasks};
        }
    };
}

module.exports = {installNativeImageReveal};
