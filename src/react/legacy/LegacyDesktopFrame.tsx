import {useCallback, useRef} from 'react';

export function LegacyDesktopFrame() {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const handleLoad = useCallback(() => {
        frameRef.current?.contentWindow?.focus();
    }, []);

    return (
        <iframe
            ref={frameRef}
            className="legacyDesktopFrame"
            src={`${window.location.origin}/legacy/index.html`}
            title="Browser OS desktop"
            onLoad={handleLoad}
        />
    );
}
