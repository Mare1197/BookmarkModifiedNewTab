import {useEffect, useState} from 'react';
import type {AssetRecord} from '../../workspace/types';
import {isSafeRaster} from './pageAssets';

export function useAssetUrls(snapshot: {assets: AssetRecord[]}): Map<string, string> {
    const [urls, setUrls] = useState<Map<string, string>>(new Map());
    useEffect(() => {
        const urls = new Map<string, string>();
        let cancelled = false;
        void Promise.all(snapshot.assets.map(async asset => {
            if (await isSafeRaster(asset) && !cancelled) urls.set(asset.entityId, URL.createObjectURL(asset.blob));
        })).then(() => {
            if (!cancelled) setUrls(new Map(urls));
        });
        return () => {
            cancelled = true;
            urls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [snapshot.assets]);
    return urls;
}
