import {Component, lazy, Suspense, useMemo, useState, type ReactNode, type ReactElement} from 'react';

class ViewLoadBoundary extends Component<{children: ReactNode; label: string; retry: () => void}, {failed: boolean}> {
    override state = {failed: false};
    static getDerivedStateFromError() {return {failed: true};}
    override render() {
        return this.state.failed ? <section role="alert"><p>Unable to load {this.props.label}. Your stored objects are unchanged.</p>
            <button onClick={this.props.retry}>Retry {this.props.label}</button>
            <button onClick={() => {if (window.confirm('Reload the app? Unsaved edits in other views may be lost.')) window.location.reload();}}>Reload app</button>
            <p>You can still navigate to another view. If the browser cached a failed module, reloading may be necessary.</p></section> : this.props.children;
    }
}

export function lazyWorkspaceView<P extends object>(load: () => Promise<{default: (props: P) => ReactElement}>, label: string) {
    return function DeferredView(props: P) {
        const [attempt, setAttempt] = useState(0);
        const View = useMemo(() => lazy(load), [attempt]);
        return <ViewLoadBoundary key={attempt} label={label} retry={() => setAttempt(value => value + 1)}>
            <Suspense fallback={<p role="status">Loading {label}…</p>}><View {...props} /></Suspense>
        </ViewLoadBoundary>;
    };
}
