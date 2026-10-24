import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCourses } from '../src/parsers/courses.js';
import { parseAssignmentsIndex, parseAssignmentDetail } from '../src/parsers/assignments.js';
import { parseCourseResources } from '../src/parsers/resources.js';
import { parseCourseGrades } from '../src/parsers/grades.js';
import { parseForumsList, parseDiscussionPosts } from '../src/parsers/forums.js';
import { parseUserProfile } from '../src/parsers/profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');

describe('UTN Mendoza HTML Parsers — Suite Completa', () => {

  // ==========================================
  // Parsers Originales (mantenidos intactos)
  // ==========================================

  it('debe parsear correctamente la lista de cursos', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'courses.html'), 'utf8');
    const courses = parseCourses(html);

    expect(courses).toHaveLength(3);
    expect(courses.map(c => c.id).sort()).toEqual(['101', '102', '103']);

    const so = courses.find(c => c.id === '101');
    expect(so).toBeDefined();
    expect(so?.name).toBe('Sistemas Operativos 2026');
    expect(so?.url).toBe('https://campusvirtual.frm.utn.edu.ar/course/view.php?id=101');

    const redes = courses.find(c => c.id === '102');
    expect(redes?.name).toBe('Redes de Información');
  });

  it('debe parsear el índice de tareas con fechas y estados', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'assign-index.html'), 'utf8');
    const assignments = parseAssignmentsIndex(html);

    expect(assignments).toHaveLength(2);

    const tp1 = assignments.find(a => a.id === '201');
    expect(tp1).toBeDefined();
    expect(tp1?.name).toBe('Trabajo Práctico 1 - Procesos');
    expect(tp1?.dueDate).toContain('viernes, 24 de octubre de 2026');
    expect(tp1?.status).toBe('Sin entrega');

    const lab = assignments.find(a => a.id === '202');
    expect(lab?.status).toBe('Enviado para calificar');
    expect(lab?.grade).toBe('9.00 / 10.00');
  });

  it('debe parsear el detalle y la consigna de una tarea', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'assign-view.html'), 'utf8');
    const detail = parseAssignmentDetail(html, 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=201');

    expect(detail.id).toBe('201');
    expect(detail.name).toBe('Trabajo Práctico 1 - Procesos');
    expect(detail.courseName).toBe('Sistemas Operativos 2026');
    expect(detail.descriptionMarkdown).toContain('Implementar un despachador de procesos en lenguaje C');
    expect(detail.submissionStatus).toBe('No entregado');
    expect(detail.gradingStatus).toBe('Sin calificar');
    expect(detail.dueDate).toContain('viernes, 24 de octubre de 2026');
    expect(detail.timeRemaining).toContain('4 días restantes');
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0].name).toBe('consigna_tp1.pdf');
  });

  it('debe parsear los recursos y agruparlos por sección', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'course-view.html'), 'utf8');
    const resources = parseCourseResources(html);

    expect(resources).toHaveLength(3);

    const pdf = resources.find(r => r.id === '501');
    expect(pdf).toBeDefined();
    expect(pdf?.name).toContain('Diapositivas Unidad 1');
    expect(pdf?.type).toBe('resource');
    expect(pdf?.section).toContain('Unidad 1: Introducción y Arquitectura');

    const folder = resources.find(r => r.id === '502');
    expect(folder?.type).toBe('folder');
    expect(folder?.name).toContain('Código de Ejemplo en C');

    const urlRes = resources.find(r => r.id === '503');
    expect(urlRes?.type).toBe('url');
    expect(urlRes?.name).toContain('Documentación POSIX Threads');
  });

  // ==========================================
  // Parsers Nuevos V2
  // ==========================================

  it('debe parsear el libro de calificaciones de una materia', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'grades.html'), 'utf8');
    const report = parseCourseGrades(html, '126');

    expect(report.courseId).toBe('126');
    expect(report.courseName).toContain('Inteligencia Artificial');
    expect(report.items.length).toBeGreaterThanOrEqual(2);

    const tp0 = report.items.find(i => i.name.includes('Practica A0'));
    expect(tp0).toBeDefined();
    expect(tp0?.grade).toBe('8,50');
    expect(tp0?.feedback).toContain('Excelente análisis');
    expect(tp0?.percentage).toContain('85');

    const inv0 = report.items.find(i => i.name.includes('Investigación I0'));
    expect(inv0).toBeDefined();
    expect(inv0?.grade).toBe('10,00');

    // Verificar que el total del curso fue detectado
    expect(report.courseTotal).toBeDefined();
    expect(report.courseTotal).toContain('9,25');
  });

  it('debe parsear la lista de foros de un curso', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'forums-list.html'), 'utf8');
    const forums = parseForumsList(html);

    expect(forums.length).toBe(2);

    const avisos = forums.find(f => f.id === '16227');
    expect(avisos).toBeDefined();
    expect(avisos?.name).toContain('Avisos');
    expect(avisos?.discussionsCount).toBe(4);
    expect(avisos?.url).toContain('/mod/forum/view.php?id=16227');

    const consultas = forums.find(f => f.id === '16228');
    expect(consultas).toBeDefined();
    expect(consultas?.name).toContain('Consultas');
    expect(consultas?.discussionsCount).toBe(12);
  });

  it('debe parsear las publicaciones de una discusión del foro', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'forum-discuss.html'), 'utf8');
    const posts = parseDiscussionPosts(html);

    expect(posts.length).toBe(2);

    const firstPost = posts[0];
    expect(firstPost.id).toBe('5963');
    expect(firstPost.subject).toContain('Primer Parcial');
    expect(firstPost.author).toContain('Gomez');
    expect(firstPost.messageMarkdown).toContain('unidades 1, 2 y 3');

    const reply = posts[1];
    expect(reply.id).toBe('5964');
    expect(reply.subject).toContain('Re:');
    expect(reply.messageMarkdown).toContain('Python');
  });

  it('debe parsear el perfil de usuario autenticado', () => {
    const html = fs.readFileSync(path.join(fixturesDir, 'profile.html'), 'utf8');
    const profile = parseUserProfile(html);

    expect(profile.fullName).toBe('Bautista Alos Martorell');
    expect(profile.email).toContain('alumnos.frm.utn.edu.ar');
    expect(profile.city).toBe('Mendoza');
    expect(profile.country).toBe('Argentina');
    expect(profile.timezone).toBe('America/Argentina/Mendoza');
  });

  it('ignora enlaces de curso que apuntan fuera del origen HTTPS del Campus', () => {
    const html = `
      <a href="https://evil.example/course/view.php?id=101">Curso falso</a>
      <a href="http://campusvirtual.frm.utn.edu.ar/course/view.php?id=102">Curso inseguro</a>
      <a href="https://campusvirtual.frm.utn.edu.ar@evil.example/course/view.php?id=103">Curso con userinfo</a>
      <a href="/course/view.php?id=104">Curso válido</a>
    `;

    expect(parseCourses(html).map(course => course.id)).toEqual(['104']);
  });
});
