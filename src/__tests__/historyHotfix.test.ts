import request from 'supertest';
import { shouldCreateSnapshot } from '../utils/resumeHistory';
import app from '../app';

describe('History snapshot and body-size hotfix', () => {
  it('does not recurse forever on cyclic content (Mongoose subdocument parent refs)', () => {
    const prevContent: any = { basics: { name: 'A', summary: 'old words here' }, sections: [] };
    prevContent.sections.push({ title: 'Work', content: [{ name: 'X' }], parent: prevContent });
    prevContent.self = prevContent;
    const nextContent = {
      basics: { name: 'A', summary: 'completely different text now' },
      sections: [{ title: 'Work', content: [{ name: 'X' }] }]
    };

    expect(() =>
      shouldCreateSnapshot({
        history: [{ updatedAt: new Date() } as any],
        prevContent,
        nextContent,
        contentChanged: true,
        themeChanged: false,
        now: new Date()
      })
    ).not.toThrow();
  });

  it('accepts JSON bodies larger than the old 100kb default', async () => {
    const big = 'x'.repeat(300 * 1024);
    const res = await request(app)
      .post('/api/__body-limit-probe__')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: big }));
    expect(res.status).toBe(404);
  });
});
