import type {PageConnector} from '../../workspace/pageTypes';
type Point = PageConnector['points'][number];
export function orthogonalRoute(source: Point, target: Point, bends: Point[]): Point[] {
    const result: Point[] = [{...source}];
    for (const next of [...bends, target]) {
        const previous = result.at(-1)!;
        if (previous.x !== next.x && previous.y !== next.y) result.push({x: next.x, y: previous.y});
        if (previous.x !== next.x || previous.y !== next.y) result.push({...next});
    }
    return result;
}
