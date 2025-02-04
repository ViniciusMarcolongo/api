const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const caCertPath = path.join(__dirname, 'certs', 'ca.crt');

// Configuração do banco
const connectionString =
	'postgresql://postgres:EPLbeW54dAoYD44U@unfailingly-pertinent-vulture.data-1.use1.tembo.io:5432/postgres';

const pool = new Pool({
	connectionString: connectionString,
	ssl: {
		ca: fs.readFileSync(caCertPath).toString(),
	}
});

// Função da API
module.exports = async (req, res) => {
	if (req.method === 'POST') {
		const { phone, placa, action, pagamento, horas } = req.body;

		// Validação do telefone
		if (!phone) {
			return res.status(400).json({ error: 'Número de telefone não fornecido.' });
		}

		// Sanitiza o telefone: remove "+55", parênteses e mantém apenas números
		const sanitizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');

		if (sanitizedPhone.length < 10 || sanitizedPhone.length > 11) {
			return res.status(400).json({ error: 'Número de telefone inválido.' });
		}

		try {
			// Busca o nome do usuário pelo telefone
			if (action === 'search') {
				const query = `
					SELECT nome 
					FROM usuarios 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
				`;
				const { rows } = await pool.query(query, [sanitizedPhone]);

				if (rows.length > 0) {
					return res.json({ nome: rows[0].nome });
				} else {
					return res.status(404).json({ error: 'Usuário não encontrado.' });
				}
			}

			// Verifica placas cadastradas pelo telefone
			if (action === 'verificar_placas') {
				const checkPlatesQuery = `
					SELECT placa 
					FROM veiculos 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
				`;
				const { rows } = await pool.query(checkPlatesQuery, [sanitizedPhone]);

				if (rows.length > 0) {
					const placas = rows.map(row => row.placa);
					return res.json({
						success: 'Placas encontradas.',
						placas: placas
					});
				} else {
					return res.status(404).json({
						success: 'Nenhuma placa encontrada para este número.',
					});
				}
			}

			// Cadastro de placa vinculada ao telefone
			if (action === 'add_plate') {
				if (!placa) {
					return res.status(400).json({ error: 'Placa não fornecida.' });
				}

				// Sanitiza a placa
				const sanitizedPlaca = placa.trim().toUpperCase();

				// Validação da placa: deve ter exatamente 7 caracteres (letras e números)
				const placaRegex = /^[A-Z0-9]{7}$/;
				if (!placaRegex.test(sanitizedPlaca)) {
					return res.status(400).json({
						error: 'Placa inválida. A placa deve ter exatamente 7 caracteres, com letras e números.',
					});
				}

				// Verifica se a placa já está cadastrada
				const checkQuery = 'SELECT placa FROM veiculos WHERE placa = $1';
				const { rows: existingPlates } = await pool.query(checkQuery, [sanitizedPlaca]);

				if (existingPlates.length > 0) {
					return res.json({
						success: `A placa ${sanitizedPlaca} já está cadastrada.`,
					});
				}

				// Insere a nova placa vinculada ao telefone
				const insertPlateQuery = `
					INSERT INTO veiculos (telefone, placa)
					VALUES ($1, $2)
				`;

				await pool.query(insertPlateQuery, [sanitizedPhone, sanitizedPlaca]);

				return res.json({
					success: 'Placa cadastrada com sucesso.',
					placa: sanitizedPlaca
				});
			}

      // Consulta de saldo pelo telefone
			if (action === 'consultar_saldo') {
				const query = `
					SELECT saldo 
					FROM usuarios 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
				`;
				const { rows } = await pool.query(query, [sanitizedPhone]);

				if (rows.length > 0) {
					return res.json({ success: 'Saldo encontrado.', saldo: rows[0].saldo });
				} else {
					return res.status(404).json({ error: 'Usuário não encontrado.' });
				}
			}

      if (action === 'validar_placa') {
        if (!validarplaca || !pagamento || !horas) {
            return res.status(400).json({ error: 'Dados incompletos para validação da placa.' });
        }

        // Definição de valores
        const valor = horas === '1' ? 2.00 : 4.00;
        const duracaoHoras = parseInt(horas);
        const now = new Date();
        const vencimento = new Date(now.getTime() + duracaoHoras * 60 * 60 * 1000);

        if (pagamento === '1') { // Pagamento via saldo
            const saldoQuery = 'SELECT saldo FROM usuarios WHERE telefone = $1';
            const { rows } = await pool.query(saldoQuery, [sanitizedPhone]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            const saldoAtual = parseFloat(rows[0].saldo);
            if (saldoAtual < valor) {
                return res.status(400).json({ error: 'Saldo insuficiente.' });
            }

            // Desconta saldo
            const updateSaldoQuery = 'UPDATE usuarios SET saldo = saldo - $1 WHERE telefone = $2';
            await pool.query(updateSaldoQuery, [valor, sanitizedPhone]);
        }

        // Insere a validação no banco
        const insertValidationQuery = `
          INSERT INTO validacoes (telefone, placa, pagamento, horas, valor_pago, horario_validacao, horario_vencimento)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await pool.query(insertValidationQuery, [
          sanitizedPhone,
          validarplaca, 
          pagamento, // 'saldo' ou 'pix'
          parseInt(horas), // 1 ou 2
          valor, // R$ 2,00 ou R$ 4,00
          now.toISOString(), 
          vencimento.toISOString() 
      ]);

        return res.json({
            success: 'Placa validada com sucesso.',
            horario_validacao: now,
            horario_vencimento: vencimento
        });
    }

			return res.status(400).json({ error: 'Ação inválida.' });
		} catch (err) {
			console.error('Erro ao consultar ou atualizar o banco de dados:', err);
			return res.status(500).json({ error: 'Erro ao consultar ou atualizar o banco de dados.' });
		}
	} else {
		// Método não permitido
		return res.status(405).json({ error: 'Método não permitido. Use POST.' });
	}
};
