process.once('message', options => {
    if (process.env.NATIVE_PROBE_TEST_MODE !== 'hang') process.send({type: 'result', result: {
        ok: true, metrics: {references: options.referenceCount, mode: options.mode}, errors: []
    }}, () => {if (process.env.NATIVE_PROBE_TEST_MODE === 'success') process.disconnect();});
    if (process.env.NATIVE_PROBE_TEST_MODE !== 'success') setInterval(() => {}, 1000);
});
