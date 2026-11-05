import { describe, it, expect } from 'vitest';
import { badRequest, isCoordinateList, readJsonObject } from '../../src/lib/apiRequest';

function request(body: string): Request {
    return new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
}

describe('badRequest', () => {
    it('returns a 400 with the { error } shape the API routes use', async () => {
        const response = badRequest('nope');

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'nope' });
    });
});

describe('readJsonObject', () => {
    it('returns the parsed body for a JSON object', async () => {
        const result = await readJsonObject(request('{"query":"Berlin","n":1}'));

        expect(result).toEqual({ ok: true, body: { query: 'Berlin', n: 1 } });
    });

    it('accepts an empty object, leaving field checks to the route', async () => {
        expect(await readJsonObject(request('{}'))).toEqual({ ok: true, body: {} });
    });

    it.each(['not json', '{"open":', ''])('returns a 400 for malformed JSON (%j)', async (body) => {
        const result = await readJsonObject(request(body));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({ error: 'Request body must be valid JSON' });
    });

    it.each(['null', '[]', '[1,2]', '"text"', '42', 'true'])('returns a 400 for a non-object body (%s)', async (body) => {
        const result = await readJsonObject(request(body));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({ error: 'Request body must be a JSON object' });
    });
});

describe('isCoordinateList', () => {
    it.each([
        ['two points', [[51.5, -0.1], [51.51, -0.09]]],
        ['many points', Array.from({ length: 50 }, (_, i) => [51.5 + i / 1000, -0.1])],
        ['points with an extra value', [[51.5, -0.1, 12], [51.51, -0.09, 13]]],
        ['negative and zero values', [[0, 0], [-33.9, -151.2]]],
        ['the extremes of each range', [[90, 180], [-90, -180]]],
    ])('accepts %s', (_label, value) => {
        expect(isCoordinateList(value)).toBe(true);
    });

    it.each([
        ['undefined', undefined],
        ['null', null],
        ['a string', '51.5,-0.1'],
        ['an object', { lat: 51.5, lng: -0.1 }],
        ['an empty array', []],
        ['a single point', [[51.5, -0.1]]],
        ['a flat list of numbers', [51.5, -0.1, 51.51, -0.09]],
        ['points with one value', [[51.5], [51.51]]],
        ['numeric strings', [['51.5', '-0.1'], ['51.51', '-0.09']]],
        ['NaN', [[NaN, -0.1], [51.51, -0.09]]],
        ['Infinity', [[51.5, Infinity], [51.51, -0.09]]],
        ['a null point', [[51.5, -0.1], null]],
        ['a latitude beyond ±90', [[90.1, 0], [51.51, -0.09]]],
        ['a longitude beyond ±180', [[51.5, -180.1], [51.51, -0.09]]],
        ['far out-of-range values', [[1000, 0], [1001, 1]]],
    ])('rejects %s', (_label, value) => {
        expect(isCoordinateList(value)).toBe(false);
    });
});
