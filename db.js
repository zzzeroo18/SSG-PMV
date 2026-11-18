let db = null;
async function inicializarDB() {
    if (db) return db;
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        const root = await navigator.storage.getDirectory();
        const dbFileName = "sgg_database.sqlite";
        let dbData = null;

        try {
            const fileHandle = await root.getFileHandle(dbFileName);
            const file = await fileHandle.getFile();
            const buffer = await file.arrayBuffer();
            dbData = new Uint8Array(buffer);
            console.log("Base de datos cargada exitosamente desde el OPFS.");
        } catch (e) {
            console.log("No se encontró base de datos previa en OPFS. Creando una nueva...");
        }
        db = new SQL.Database(dbData);
        if (!dbData) {
            crearEsquemaTablas();
        }
        return db;
    } catch (error) {
        console.error("Error crítico al inicializar SQLite con OPFS:", error);
        throw error;
    }
}
function crearEsquemaTablas() {
    const querySchema = `
        CREATE TABLE IF NOT EXISTS usuarios (
            email TEXT PRIMARY KEY NOT NULL,
            nombre TEXT NOT NULL,
            apellido TEXT NOT NULL,
            nacimiento TEXT NOT NULL,
            password TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS gastos (
            id_gasto INTEGER PRIMARY KEY AUTOINCREMENT,
            email_usuario TEXT NOT NULL,
            monto REAL NOT NULL CHECK (monto > 0),
            fecha TEXT NOT NULL,
            categoria TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            tipo_movimiento TEXT NOT NULL DEFAULT 'egreso',
            url_comprobante TEXT DEFAULT NULL,
            estado_activo INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (email_usuario) REFERENCES usuarios(email) ON DELETE CASCADE
        );
    `;
    db.run(querySchema);
    sincronizarOPFS();
    console.log("Esquema relacional de tablas creado correctamente.");
}
async function sincronizarOPFS() {
    if (!db) return;
    try {
        const data = db.export();
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle("sgg_database.sqlite", { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        console.log("Base de datos respaldada en el OPFS local.");
    } catch (error) {
        console.error("Error al guardar en OPFS:", error);
    }
}
