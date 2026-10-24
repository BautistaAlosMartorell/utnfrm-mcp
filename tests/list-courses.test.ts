import { beforeEach, describe, expect, it, vi } from 'vitest';

const campus = vi.hoisted(() => ({
  getHtml: vi.fn(),
  getRenderedHtml: vi.fn()
}));

vi.mock('../src/client/campus-client.js', () => ({ campusClient: campus }));

import { handleListCourses } from '../src/tools/list-courses.js';

describe('list_courses fallback behavior', () => {
  beforeEach(() => {
    campus.getHtml.mockReset();
    campus.getRenderedHtml.mockReset();
  });

  it('surfaces expired authentication instead of returning a successful empty list', async () => {
    campus.getHtml.mockRejectedValueOnce(new Error('La sesión del Campus Virtual expiró.'));

    await expect(handleListCourses()).rejects.toThrow(/expiró/i);
    expect(campus.getHtml).toHaveBeenCalledTimes(1);
    expect(campus.getRenderedHtml).not.toHaveBeenCalled();
  });

  it('surfaces the final read error when every route fails', async () => {
    campus.getHtml
      .mockRejectedValueOnce(new Error('Fallo temporal en /my/courses.php'))
      .mockResolvedValueOnce('<html><body id="page-my-index"></body></html>');
    campus.getRenderedHtml.mockRejectedValueOnce(new Error('No se pudo renderizar Moodle.'));

    await expect(handleListCourses()).rejects.toThrow(/renderizar Moodle/i);
  });

  it('reports an empty result only when Moodle explicitly says there are no courses', async () => {
    const emptyMoodlePage = '<html><body id="page-my-index"><p>No hay cursos disponibles.</p></body></html>';
    campus.getHtml.mockResolvedValue(emptyMoodlePage);
    campus.getRenderedHtml.mockResolvedValue(emptyMoodlePage);

    await expect(handleListCourses()).resolves.toEqual({ courses: [], count: 0 });
  });

  it('does not report an unrecognized Moodle page as an empty course list', async () => {
    const unexpectedMoodlePage = '<html><body id="page-my-index"><main>Unexpected content</main></body></html>';
    campus.getHtml.mockResolvedValue(unexpectedMoodlePage);
    campus.getRenderedHtml.mockResolvedValue(unexpectedMoodlePage);

    await expect(handleListCourses()).rejects.toThrow(/no confirmó una lista vacía/i);
  });
});
