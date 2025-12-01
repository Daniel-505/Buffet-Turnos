import { Elysia, t } from 'elysia';
import { html } from '@elysiajs/html';
import { staticPlugin as file } from '@elysiajs/static';
import { compare, hash } from 'bcrypt';
import { randomUUID } from 'node:crypto'; 
import { prisma } from './prisma-client';
import { processCsv } from './csv-importer'; 
import nodemailer from 'nodemailer'; // ⬅️ AÑADIR ESTA LÍNEA
import 'dotenv/config'; 

// --- CONFIGURACIÓN DE ADMINISTRADOR (Tu correo para las solicitudes) ---
const ADMIN_EMAIL = "fericos190@gmail.com"; 
// ---------------------------------------------------------------------

// Mapa para simular el estado de los turnos en memoria
const pedidosEnCurso = new Map<number, { turnoNumero: number, estado: string, alumnoDNI?: string, nombre?: string, apellido?: string }>();

const app = new Elysia()
  .use(html())
  .use(file({ assets: 'public', prefix: '/' })) 

  // --- RUTAS DE VISUALIZACIÓN ---
  .get('/', () => Bun.file('public/login.html'))
  .get('/register', () => Bun.file('public/register.html')) // Formulario de Registro
  .get('/dashboard', () => Bun.file('public/dashboard.html'))
  .get('/kiosquero', () => Bun.file('public/kiosquero.html'))

    // --- WEB SOCKETS MEJORADO PARA AMBOS ---
  .ws('/ws/turnos', {
    open(ws) {
      console.log('🔌 Nueva conexión WebSocket');
      // Enviar estado actual al conectar
      const turnosData = JSON.stringify({
        type: 'INITIAL_STATE',
        data: Array.from(pedidosEnCurso.values())
      });
      ws.send(turnosData);
    },
    message(ws, message) { 
      console.log('📨 Mensaje WebSocket recibido:', typeof message, message);
      
      // Manejar diferentes tipos de mensajes
      try {
        let messageStr = '';
        
        if (typeof message === 'string') {
          messageStr = message;
        } else if (message instanceof Buffer) {
          messageStr = message.toString();
        } else {
          messageStr = String(message);
        }
        
        // Si el cliente solicita datos, enviarlos
        if (messageStr.includes('get_turnos') || messageStr.includes('GET_CURRENT_STATE')) {
          const turnosData = JSON.stringify({
            type: 'UPDATE',
            data: Array.from(pedidosEnCurso.values())
          });
          ws.send(turnosData);
        }
      } catch (error) {
        console.error('❌ Error procesando mensaje WebSocket:', error);
      }
    },
    close(ws) {
      console.log('🔌 Conexión WebSocket cerrada');
    }
  })

  // --- API DE AUTENTICACIÓN (REGISTRO Y APROBACIÓN POR ADMIN) ---
  .group('/auth', (app) => app
    // 1. Iniciar sesión
    .post('/login', async ({ body, set }) => {
      const { dni, password } = body as { dni: string, password: string };
      try {
        const alumno = await prisma.alumno.findUnique({ where: { DNI: dni } });
        if (!alumno || !await compare(password, alumno.password)) {
          set.status = 401;
          return { success: false, message: "DNI o contraseña incorrectos." };
        }
        return { 
          success: true, 
          message: "Inicio de sesión exitoso.", 
          alumno: { 
            dni: alumno.DNI, 
            nombre: alumno.nombre,
            apellido: alumno.apellido 
          } 
        };
      } catch (error) {
        console.error("Error en login:", error);
        set.status = 500;
        return { success: false, message: "Error interno del servidor." };
      }
    }, {
      body: t.Object({ dni: t.String(), password: t.String() })
    })

    // 2. Ruta POST para solicitar el registro (crea PendingUser y envía email REAL)
    .post('/register', async ({ body, set }) => {
      const { dni, nombre, apellido, password, email } = body as any;
      
      try {
          // 1. Verificar existencia
          const existingAlumno = await prisma.alumno.findUnique({ where: { DNI: dni } });
          const existingPendingUserDNI = await prisma.pendingUser.findUnique({ where: { DNI: dni } });
          
          if (existingAlumno || existingPendingUserDNI) {
              set.status = 409; 
              return { success: false, message: "El DNI ya está registrado o pendiente de aprobación." };
          }

          // 2. Hashear la contraseña y generar el token UUID
          const hashedPassword = await hash(password, 10);
          const verificationToken = randomUUID();

          // 3. Crear el registro temporal en PendingUser
          await prisma.pendingUser.create({
              data: {
                  DNI: dni,
                  nombre,
                  apellido,
                  password: hashedPassword,
                  email,
                  verificationToken: verificationToken,
              }
          });

          // 4. Generar enlaces de APROBACIÓN/DENEGACIÓN para el ADMINISTRADOR
          const acceptLink = `http://localhost:3000/auth/review/${verificationToken}/accept`;
          const denyLink = `http://localhost:3000/auth/review/${verificationToken}/deny`;

          // 5. ENVÍO REAL DE EMAIL AL ADMINISTRADOR
          try {
              const transporter = nodemailer.createTransport({
                  host: process.env.SMTP_HOST,
                  port: parseInt(process.env.SMTP_PORT || '587'),
                  secure: false,
                  auth: {
                      user: process.env.SMTP_USER,
                      pass: process.env.SMTP_PASS,
                  },
              });

              const mailOptions = {
                  from: process.env.SMTP_USER,
                  to: ADMIN_EMAIL,
                  subject: '✅ Nueva Solicitud de Registro - Buffet Turnos',
                  html: `
                      <h2>Nueva solicitud de registro</h2>
                      <p><strong>DNI:</strong> ${dni}</p>
                      <p><strong>Nombre:</strong> ${nombre} ${apellido}</p>
                      <p><strong>Email:</strong> ${email}</p>
                      <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
                      
                      <h3>Acciones:</h3>
                      <p>
                          <a href="${acceptLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">
                              ✅ Aprobar Cuenta
                          </a>
                          <a href="${denyLink}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                              ❌ Denegar Cuenta
                          </a>
                      </p>
                      
                      <p><small>Este es un email automático del sistema Buffet Turnos.</small></p>
                  `,
              };

              await transporter.sendMail(mailOptions);
              console.log(`📧 Email de aprobación enviado REALMENTE a: ${ADMIN_EMAIL}`);
              
          } catch (emailError) {
              console.error('❌ Error enviando email:', emailError);
              // No falla el registro si el email falla, solo log el error
          }

          // 6. ENVÍO REAL DE EMAIL DE CONFIRMACIÓN AL USUARIO
          try {
              const transporter = nodemailer.createTransport({
                  host: process.env.SMTP_HOST,
                  port: parseInt(process.env.SMTP_PORT || '587'),
                  secure: false,
                  auth: {
                      user: process.env.SMTP_USER,
                      pass: process.env.SMTP_PASS,
                  },
              });

              const userMailOptions = {
                  from: process.env.SMTP_USER,
                  to: email,
                  subject: '📋 Solicitud de Registro Recibida - Buffet Turnos',
                  html: `
                      <h2>¡Solicitud Recibida!</h2>
                      <p>Hola <strong>${nombre}</strong>,</p>
                      <p>Tu solicitud de registro ha sido recibida correctamente y está pendiente de aprobación.</p>
                      <p><strong>DNI:</strong> ${dni}</p>
                      <p><strong>Estado:</strong> Pendiente de revisión</p>
                      <p>Recibirás un email de confirmación una vez que tu cuenta sea aprobada por el administrador.</p>
                      
                      <p><small>Este es un email automático del sistema Buffet Turnos.</small></p>
                  `,
              };

              await transporter.sendMail(userMailOptions);
              console.log(`📧 Email de confirmación enviado REALMENTE a: ${email}`);
              
          } catch (userEmailError) {
              console.error('❌ Error enviando email al usuario:', userEmailError);
          }

          return { 
              success: true, 
              message: "Solicitud enviada. Revisa tu email para confirmación." 
          };

      } catch (error) {
          console.error("Error al registrar solicitud:", error);
          set.status = 500;
          return { success: false, message: "Error interno al procesar la solicitud." };
      }
    }, {
      body: t.Object({ 
        dni: t.String(), 
        nombre: t.String(), 
        apellido: t.String(), 
        password: t.String(), 
        email: t.String()
      })
    })

        // 3. Ruta GET para que el administrador APROBUEBE o DENIEGUE la cuenta
    .get('/review/:token/:action', async ({ params, set }) => {
      const { token, action } = params;

      try {
        const pendingUser = await prisma.pendingUser.findUnique({
          where: { verificationToken: token }
        });

        if (!pendingUser) {
          set.status = 404;
          return Bun.file('public/admin_review_failed.html'); 
        }

        if (action === 'accept') {
          // 3a. ACEPTAR: Transferir a Alumno
          await prisma.alumno.create({
            data: {
              DNI: pendingUser.DNI,
              nombre: pendingUser.nombre,
              apellido: pendingUser.apellido,
              password: pendingUser.password, // Ya está hasheada
            }
          });

          // ENVÍO DE EMAIL DE APROBACIÓN AL USUARIO
          try {
            const transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || '587'),
              secure: false,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
              tls: {
                rejectUnauthorized: false
              }
            });

            const mailOptions = {
              from: `"Buffet Turnos" <${process.env.SMTP_USER}>`,
              to: pendingUser.email,
              subject: '✅ Cuenta Aprobada - Buffet Turnos',
              html: `
                <h2>¡Tu cuenta ha sido aprobada!</h2>
                <p>Hola <strong>${pendingUser.nombre} ${pendingUser.apellido}</strong>,</p>
                <p>Nos complace informarte que tu solicitud de registro ha sido <strong>APROBADA</strong>.</p>
                
                <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p><strong>📋 Información de tu cuenta:</strong></p>
                  <p><strong>DNI:</strong> ${pendingUser.DNI}</p>
                  <p><strong>Nombre:</strong> ${pendingUser.nombre} ${pendingUser.apellido}</p>
                  <p><strong>Estado:</strong> ✅ Activa</p>
                </div>

                <p>Ahora puedes iniciar sesión en el sistema y solicitar tus turnos para el buffet.</p>
                
                <a href="http://localhost:3000/" style="background-color: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0;">
                  🚀 Iniciar Sesión
                </a>

                <p><small>Este es un email automático del sistema Buffet Turnos.</small></p>
              `
            };

            await transporter.sendMail(mailOptions);
            console.log(`📧 Email de aprobación enviado a: ${pendingUser.email}`);
            
          } catch (emailError) {
            console.error('❌ Error enviando email de aprobación:', emailError);
          }

          // Eliminar el registro pendiente
          await prisma.pendingUser.delete({ where: { id: pendingUser.id } });
          
          console.log(`✅ Cuenta APROBADA para: ${pendingUser.nombre} (${pendingUser.email})`);
          return Bun.file('public/admin_accept_success.html'); 

        } else if (action === 'deny') {
          // ENVÍO DE EMAIL DE RECHAZO AL USUARIO
          try {
            const transporter = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: parseInt(process.env.SMTP_PORT || '587'),
              secure: false,
              auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
              },
              tls: {
                rejectUnauthorized: false
              }
            });

            const mailOptions = {
              from: `"Buffet Turnos" <${process.env.SMTP_USER}>`,
              to: pendingUser.email,
              subject: '❌ Solicitud Rechazada - Buffet Turnos',
              html: `
                <h2>Solicitud de registro rechazada</h2>
                <p>Hola <strong>${pendingUser.nombre} ${pendingUser.apellido}</strong>,</p>
                <p>Lamentamos informarte que tu solicitud de registro ha sido <strong>RECHAZADA</strong>.</p>
                
                <div style="background-color: #ffe8e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p><strong>📋 Información de la solicitud:</strong></p>
                  <p><strong>DNI:</strong> ${pendingUser.DNI}</p>
                  <p><strong>Nombre:</strong> ${pendingUser.nombre} ${pendingUser.apellido}</p>
                  <p><strong>Estado:</strong> ❌ Rechazada</p>
                  <p><strong>Fecha:</strong> ${new Date().toLocaleDateString()}</p>
                </div>

                <p><strong>Posibles motivos:</strong></p>
                <ul>
                  <li>DNI ya registrado en el sistema</li>
                  <li>Información incompleta o incorrecta</li>
                  <li>No cumple con los requisitos de registro</li>
                </ul>

                <p>Si crees que esto es un error, puedes contactar con la administración.</p>

                <p><small>Este es un email automático del sistema Buffet Turnos.</small></p>
              `
            };

            await transporter.sendMail(mailOptions);
            console.log(`📧 Email de rechazo enviado a: ${pendingUser.email}`);
            
          } catch (emailError) {
            console.error('❌ Error enviando email de rechazo:', emailError);
          }

          // Eliminar el registro pendiente
          await prisma.pendingUser.delete({ where: { id: pendingUser.id } });
          
          console.log(`❌ Cuenta RECHAZADA para: ${pendingUser.nombre} (${pendingUser.email})`);
          return Bun.file('public/admin_deny_success.html');
        } else {
          set.status = 400;
          return Bun.file('public/admin_review_failed.html');
        }

      } catch (error) {
        console.error(`Error al procesar la revisión (${action}):`, error);
        return Bun.file('public/admin_review_failed.html'); 
      }
    })
  )
  // --- API DE ADMINISTRADOR Y PEDIDOS ---
  .group('/admin', (app) => app
    .post('/import-alumnos', async ({ body, set }) => {
      try {
        const file = (body as { file: File }).file;
        if (!file || file.type !== 'text/csv') { 
          set.status = 400; 
          return { success: false, message: "CSV requerido." }; 
        }
        const results = await processCsv(await file.arrayBuffer());
        return { 
          success: true, 
          message: `Importación finalizada. Creados: ${results.imported}.` 
        };
      } catch (error) { 
        console.error("Error importando alumnos:", error);
        set.status = 500; 
        return { success: false, message: "Error en el servidor." }; 
      }
    }, { 
      body: t.Object({ file: t.File() }) 
    })
  )
  
  .group('/api', (app) => app
    .post('/pedido', async ({ body, set }) => {
      const { dni, items } = body as { dni: string, items: string };
      
      try {
        // 🔥 VERIFICAR SI YA TIENE UN TURNO ACTIVO
        const turnoActivo = await prisma.pedido.findFirst({
          where: {
            alumnoDNI: dni,
            estado: {
              in: ['EN_COLA', 'LISTO'] // Solo buscar turnos que no estén retirados
            }
          }
        });

        if (turnoActivo) {
          set.status = 400;
          return { 
            success: false, 
            message: `Ya tienes un turno activo (#${turnoActivo.turnoNumero}). Solo puedes tener un turno a la vez.` 
          };
        }

        const lastOrder = await prisma.pedido.findFirst({ 
          orderBy: { turnoNumero: 'desc' }, 
          select: { turnoNumero: true } 
        });
        const newTurnoNumero = (lastOrder?.turnoNumero || 0) + 1;
        
        const alumno = await prisma.alumno.findUnique({ where: { DNI: dni } });
        if (!alumno) { 
          set.status = 404; 
          return { success: false, message: "Alumno no encontrado." }; 
        }
        
        const newOrder = await prisma.pedido.create({ 
          data: { 
            alumnoDNI: dni, 
            turnoNumero: newTurnoNumero, 
            estado: 'EN_COLA',
            items: items
          } 
        });
        
        const pedidoData = { 
          turnoNumero: newOrder.turnoNumero, 
          estado: newOrder.estado, 
          alumnoDNI: newOrder.alumnoDNI, 
          nombre: alumno.nombre, 
          apellido: alumno.apellido,
          items: items
        };
        
        pedidosEnCurso.set(newTurnoNumero, pedidoData);
        
        // Notificar a TODOS los clientes WebSocket
        app.server?.publish('/ws/turnos', JSON.stringify({
          type: 'UPDATE',
          data: Array.from(pedidosEnCurso.values())
        }));
        
        console.log(`📢 Nuevo pedido creado: Turno ${newTurnoNumero} para DNI ${dni}`);
        
        return { 
          success: true, 
          turno: newTurnoNumero, 
          message: `Tu turno es el número ${newTurnoNumero}` 
        };
      } catch (error) {
        console.error("Error creando pedido:", error);
        set.status = 500;
        return { success: false, message: "Error interno del servidor." };
      }
    }, { 
      body: t.Object({ 
        dni: t.String(), 
        items: t.String() 
      }) 
    })
        
    .post('/update-estado', async ({ body, set }) => {
      const { turno, estado } = body as { turno: number, estado: string };
      
      if (!['EN_COLA', 'LISTO', 'RETIRADO'].includes(estado)) { 
        set.status = 400; 
        return { success: false, message: "Estado no válido." }; 
      }
      
      try {
        const updatedOrder = await prisma.pedido.update({ 
          where: { turnoNumero: turno }, 
          data: { estado: estado }, 
          include: { alumno: true } 
        });
        
        const pedidoData = { 
          turnoNumero: updatedOrder.turnoNumero, 
          estado: updatedOrder.estado, 
          alumnoDNI: updatedOrder.alumnoDNI, 
          nombre: updatedOrder.alumno.nombre, 
          apellido: updatedOrder.alumno.apellido,
          items: updatedOrder.items
        };
        
        if (estado === 'RETIRADO') { 
          pedidosEnCurso.delete(turno); 
        } else { 
          pedidosEnCurso.set(turno, pedidoData); 
        }
        
        // 🔥 IMPORTANTE: Notificar a TODOS los clientes WebSocket INMEDIATAMENTE
        app.server?.publish('/ws/turnos', JSON.stringify({
          type: 'UPDATE',
          data: Array.from(pedidosEnCurso.values())
        }));
        
        console.log(`📢 Estado actualizado: Turno ${turno} -> ${estado}, notificando WebSockets`);
        
        return { 
          success: true, 
          message: `Turno ${turno} actualizado a ${estado}` 
        };
      } catch (error) {
        console.error("Error actualizando estado:", error);
        set.status = 404; 
        return { success: false, message: "Turno no encontrado en la DB" }; 
      }
    }, { 
      body: t.Object({ 
        turno: t.Number(), 
        estado: t.String() 
      }) 
    })
    
    .get('/current-orders', async () => {
      try {
        const orders = await prisma.pedido.findMany({ 
          where: { estado: { not: 'RETIRADO' } }, 
          include: { alumno: true } 
        });
        
        pedidosEnCurso.clear();
        orders.forEach(order => {
          pedidosEnCurso.set(order.turnoNumero, {
            turnoNumero: order.turnoNumero, 
            estado: order.estado, 
            alumnoDNI: order.alumnoDNI, 
            nombre: order.alumno.nombre, 
            apellido: order.alumno.apellido,
            items: order.items
          });
        });
        
        return Array.from(pedidosEnCurso.values());
      } catch (error) {
        console.error("Error obteniendo órdenes actuales:", error);
        return [];
      }
    })
  )

  // --- MANEJO DE ERRORES GLOBAL ---
  .onError(({ code, error, set }) => {
    console.error(`Error ${code}:`, error);
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { success: false, message: "Ruta no encontrada" };
    }
    set.status = 500;
    return { success: false, message: "Error interno del servidor" };
  })

  // --- INICIAR SERVIDOR ---
  .listen({ port: 3000, hostname: '0.0.0.0' }, ({ hostname, port }) => {
    console.log(`🔥 Servidor Bun corriendo en http://localhost:3000 (Escuchando en ${hostname}:${port})`);
    console.log(`📊 Panel de administración: http://localhost:3000/kiosquero`);
    console.log(`👤 Dashboard alumno: http://localhost:3000/dashboard`);
  });

export type App = typeof app;