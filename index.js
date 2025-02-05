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

// Mapeamento das cidades
const cidadesMap = {
	'1': { nome: 'Biritiba Mirim', idOrgao: 11143 },
	'2': { nome: 'Santa Isabel', idOrgao: 11144 },
	'3': { nome: 'Capivari', idOrgao: 11145 },
	'4': { nome: 'Ferraz de Vasconcelos', idOrgao: 11146 },
	'5': { nome: 'Paraisópolis', idOrgao: 11147 },
	'6': { nome: 'Poá', idOrgao: 11148 },
	'7': { nome: 'Registro', idOrgao: 11149 },
	'8': { nome: 'Suzano', idOrgao: 11150 },
	'9': { nome: 'São Roque', idOrgao: 11151 },
};

// API principal
module.exports = async (req, res) => {
	if (req.method === 'POST') {
		const { action, cidadeSelecionada, phone, placa, pagamento, horas } = req.body;

		// 📌 Selecionar cidade
		if (action === 'selecionar_cidade') {
			if (!cidadeSelecionada || !cidadesMap[cidadeSelecionada]) {
				return res.status(400).json({ error: 'Cidade inválida. Escolha um número de 1 a 9.' });
			}

			const { nome, idOrgao } = cidadesMap[cidadeSelecionada];
			return res.json({ success: `Cidade selecionada: ${nome}`, idOrgao });
		}

		// 📌 Todas as outras funções precisam do idOrgao
		if (!phone || !req.body.idOrgao) {
			return res.status(400).json({ error: 'Número de telefone ou idOrgao não fornecido.' });
		}

		// 📌 Formatar telefone corretamente antes da consulta
		const sanitizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');
		if (sanitizedPhone.length < 10 || sanitizedPhone.length > 11) {
			return res.status(400).json({ error: 'Número de telefone inválido.' });
		}

		try {
			const idOrgao = req.body.idOrgao;

			// 📌 Buscar nome do usuário na cidade selecionada
			if (action === 'search') {
				const query = `
					SELECT nome 
					FROM usuarios 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
					AND idOrgao = $2
				`;
				const { rows } = await pool.query(query, [sanitizedPhone, idOrgao]);

				if (rows.length > 0) {
					return res.json({ nome: rows[0].nome });
				} else {
					return res.status(404).json({ error: 'Usuário não encontrado nesta cidade.' });
				}
			}

			// 📌 Validação de placa dentro da cidade
			if (action === 'validar_placa') {
				if (!placa || !pagamento || !horas) {
					return res.status(400).json({ error: 'Dados incompletos para validação da placa.' });
				}

				const valor = horas === '1' ? 2.00 : 4.00;
				const duracaoHoras = parseInt(horas);
				const now = new Date();
				const vencimento = new Date(now.getTime() + duracaoHoras * 60 * 60 * 1000);

				// 📌 Se for pagamento via saldo, verificar saldo na cidade correspondente
				if (pagamento === '1') {
					const saldoQuery = `
						SELECT saldo 
						FROM usuarios 
						WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1 
						AND idOrgao = $2
					`;
					const { rows } = await pool.query(saldoQuery, [sanitizedPhone, idOrgao]);

					if (rows.length === 0) {
						return res.status(404).json({ error: 'Usuário não encontrado na cidade.' });
					}

					const saldoAtual = parseFloat(rows[0].saldo);
					if (saldoAtual < valor) {
						return res.status(400).json({ error: 'Saldo insuficiente.' });
					}

					// Atualiza saldo na cidade correta
					const updateSaldoQuery = `
						UPDATE usuarios 
						SET saldo = saldo - $1 
						WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $2 
						AND idOrgao = $3
					`;
					await pool.query(updateSaldoQuery, [valor, sanitizedPhone, idOrgao]);
				}

				// 📌 Inserindo a validação da placa no banco
				const insertValidationQuery = `
					INSERT INTO validacoes (telefone, placa, pagamento, horas, valor_pago, horario_validacao, horario_vencimento, idOrgao)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				`;
				await pool.query(insertValidationQuery, [
					sanitizedPhone, 
					placa, 
					pagamento, 
					parseInt(horas), 
					valor, 
					now.toISOString(), 
					vencimento.toISOString(),
					idOrgao
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
		return res.status(405).json({ error: 'Método não permitido. Use POST.' });
	}
};
