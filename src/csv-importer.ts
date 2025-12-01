import parse from 'csv-parser'; // ¡Importación corregida!
import { prisma } from './prisma-client'; 
import { hash } from 'bcrypt';
import { Readable } from 'stream'; 

// Interfaz para la estructura esperada del CSV
interface CsvAlumno {
    dni: string;
    nombre: string;
    apellido: string;
    passwordtemporal: string;
}

// Función principal para procesar el CSV (Nombre de función corregido: processCsv)
export async function processCsv(buffer: ArrayBuffer): Promise<{ imported: number, failed: number }> {
    const stream = Readable.from(Buffer.from(buffer));
    const results: CsvAlumno[] = [];
    let importedCount = 0;
    let failedCount = 0;

    // 1. Parsear el CSV
    await new Promise((resolve, reject) => {
        stream
            .pipe(parse({ headers: true }))
            .on('error', (error) => {
                console.error("CSV Parsing Error:", error);
                reject(error);
            })
            .on('data', (data: CsvAlumno) => {
                // Asegurar que las columnas existan y limpiar espacios en blanco
                if (data.dni && data.nombre && data.apellido && data.passwordtemporal) {
                    results.push({
                        dni: data.dni.trim(),
                        nombre: data.nombre.trim(),
                        apellido: data.apellido.trim(),
                        passwordtemporal: data.passwordtemporal.trim(),
                    });
                } else {
                    failedCount++;
                }
            })
            .on('end', () => {
                resolve(true);
            });
    });

    // 2. Procesar e insertar en la base de datos (Upsert)
    for (const alumno of results) {
        try {
            // Generar un hash seguro de la contraseña
            const hashedPassword = await hash(alumno.passwordtemporal, 10);
            
            // Insertar o actualizar el alumno
            await prisma.alumno.upsert({
                where: { DNI: alumno.dni },
                update: { 
                    nombre: alumno.nombre,
                    apellido: alumno.apellido,
                    password: hashedPassword,
                },
                create: {
                    DNI: alumno.dni,
                    nombre: alumno.nombre,
                    apellido: alumno.apellido,
                    password: hashedPassword,
                }
            });
            importedCount++;
        } catch (e) {
            console.error(`Error al procesar alumno con DNI ${alumno.dni}:`, e);
            failedCount++;
        }
    }

    return { imported: importedCount, failed: failedCount };
}