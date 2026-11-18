document.addEventListener("DOMContentLoaded", async () => {
    const sessionData = JSON.parse(localStorage.getItem("sgg_session"));
    if (!sessionData || !sessionData.email) {
        window.location.href = "index.html";
        return;
    }

    const userDisplay = document.getElementById("user-display");
    if (userDisplay) {
        userDisplay.textContent = `Usuario: ${sessionData.nombre} (${sessionData.email})`;
    }

    document.getElementById("btn-logout").addEventListener("click", () => {
        localStorage.removeItem("sgg_session");
        window.location.href = "index.html";
    });

    let database;
    try {
        database = await inicializarDB();
    } catch (err) {
        alert("Error crítico al inicializar la base de datos local SQLite.");
        return;
    }

    const gastoForm = document.getElementById("gasto-form");
    const gastoIdInput = document.getElementById("gasto-id");
    const montoInput = document.getElementById("monto");
    const fechaInput = document.getElementById("fecha");
    const categoriaSelect = document.getElementById("categoria");
    const descripcionInput = document.getElementById("descripcion");
    const tipoMovimientoSelect = document.getElementById("tipo_movimiento");
    const comprobanteFile = document.getElementById("comprobante-file");
    const msg = document.getElementById("gasto-msg");
    const btnCancelarEdit = document.getElementById("btn-cancelar-edit");
    const formTitle = document.getElementById("form-title");

    const deleteModal = document.getElementById("delete-modal");
    const btnConfirmDelete = document.getElementById("btn-confirm-delete");
    const btnCancelDelete = document.getElementById("btn-cancel-delete");
    let itemToDeleteId = null;

    renderGastosSQL();

    gastoForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const monto = parseFloat(montoInput.value);
        const fecha = fechaInput.value;
        const categoria = categoriaSelect.value;
        const descripcion = descripcionInput.value.trim();
        const tipo_movimiento = tipoMovimientoSelect.value;
        const editId = gastoIdInput.value;

        if (isNaN(monto) || monto <= 0) {
            msg.style.color = "var(--error-color)";
            msg.textContent = "El monto debe ser un número mayor a cero.";
            return;
        }
        let url_comprobante = null;
        if (comprobanteFile.files.length > 0) {
            const file = comprobanteFile.files[0];
            const formData = new FormData();
            formData.append("image", file);

            try {
                const response = await fetch("https://api.imgbb.com/1/upload?key=YOUR_IMGBB_API_KEY", {
                    method: "POST",
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    url_comprobante = result.data.url;
                }
            } catch (error) {
                console.warn("Falla de red al subir la imagen. Se guardará como NULL por resiliencia.", error);
            }
        }

        if (editId) {
            const stmt = database.prepare(`
                UPDATE gastos 
                SET monto = ?, fecha = ?, categoria = ?, descripcion = ?, tipo_movimiento = ? 
                WHERE id_gasto = ? AND email_usuario = ?
            `);
            stmt.run([monto, fecha, categoria, descripcion, tipo_movimiento, editId, sessionData.email]);
            stmt.free();
            msg.style.color = "var(--success-color)";
            msg.textContent = "Gasto actualizado correctamente en SQLite.";
        } else {
            const stmt = database.prepare(`
                INSERT INTO gastos (email_usuario, monto, fecha, categoria, descripcion, tipo_movimiento, url_comprobante, estado_activo)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `);
            stmt.run([sessionData.email, monto, fecha, categoria, descripcion, tipo_movimiento, url_comprobante]);
            stmt.free();
            msg.style.color = "var(--success-color)";
            msg.textContent = "Movimiento cargado exitosamente en SQLite.";
        }

        await sincronizarOPFS();
        resetForm();
        renderGastosSQL();

        setTimeout(() => { msg.textContent = ""; }, 3000);
    });

    function renderGastosSQL() {
        const tablaBody = document.getElementById("tabla-gastos-body");
        const totalDisplay = document.getElementById("total-monto");
        tablaBody.innerHTML = "";

        const stmt = database.prepare(`
            SELECT id_gasto, fecha, categoria, descripcion, monto, tipo_movimiento, url_comprobante 
            FROM gastos 
            WHERE email_usuario = ? AND estado_activo = 1 
            ORDER BY fecha DESC
        `);
        stmt.bind([sessionData.email]);

        let total = 0;

        while (stmt.step()) {
            const row = stmt.get();
            const [id, fecha, categoria, descripcion, monto, tipo, comprobante] = row;

            if (tipo === 'ingreso') {
                total += monto;
            } else {
                total -= monto;
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${fecha}</td>
                <td>${categoria} <br><small style="color: ${tipo === 'ingreso' ? 'var(--success-color)' : 'var(--error-color)'}; font-weight: bold;">${tipo.toUpperCase()}</small></td>
                <td>${descripcion} ${comprobante ? `<br><a href="${comprobante}" target="_blank">📄 Ver Comprobante</a>` : ''}</td>
                <td>$ ${monto.toFixed(2)}</td>
                <td>
                    <button class="btn-edit" data-id="${id}">Editar</button>
                    <button class="btn-delete" data-id="${id}">Eliminar</button>
                </td>
            `;
            tablaBody.appendChild(tr);
        }
        stmt.free();

        totalDisplay.textContent = `$ ${total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        document.querySelectorAll(".btn-edit").forEach(btn => {
            btn.addEventListener("click", () => prepararEdicion(btn.dataset.id));
        });

        document.querySelectorAll(".btn-delete").forEach(btn => {
            btn.addEventListener("click", () => abrirModalEliminar(btn.dataset.id));
        });
    }

    function prepararEdicion(id) {
        const stmt = database.prepare("SELECT id_gasto, monto, fecha, categoria, descripcion, tipo_movimiento FROM gastos WHERE id_gasto = ?");
        stmt.bind([id]);
        if (stmt.step()) {
            const [gastoId, monto, fecha, categoria, descripcion, tipo] = stmt.get();
            gastoIdInput.value = gastoId;
            montoInput.value = monto;
            fechaInput.value = fecha;
            categoriaSelect.value = categoria;
            descripcionInput.value = descripcion;
            tipoMovimientoSelect.value = tipo;

            formTitle.textContent = "Editar Movimiento";
            btnCancelarEdit.style.display = "inline-block";
        }
        stmt.free();
    }

    btnCancelarEdit.addEventListener("click", resetForm);

    function resetForm() {
        gastoForm.reset();
        gastoIdInput.value = "";
        formTitle.textContent = "Cargar Nuevo Gasto";
        btnCancelarEdit.style.display = "none";
    }

    function abrirModalEliminar(id) {
        itemToDeleteId = id;
        deleteModal.showModal();
    }

    btnCancelDelete.addEventListener("click", () => {
        deleteModal.close();
        itemToDeleteId = null;
    });

    btnConfirmDelete.addEventListener("click", async () => {
        if (itemToDeleteId) {
           
            const stmt = database.prepare("UPDATE gastos SET estado_activo = 0 WHERE id_gasto = ?");
            stmt.run([itemToDeleteId]);
            stmt.free();
            await sincronizarOPFS();
            renderGastosSQL();
        }
        deleteModal.close();
        itemToDeleteId = null;
    });
});