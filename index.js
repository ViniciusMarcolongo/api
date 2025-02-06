const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const caCertPath = path.join(__dirname, 'certs', 'ca.crt');


const connectionString =
	'postgresql://postgres:EPLbeW54dAoYD44U@unfailingly-pertinent-vulture.data-1.use1.tembo.io:5432/postgres';

const pool = new Pool({
	connectionString: connectionString,
	ssl: {
		ca: fs.readFileSync(caCertPath).toString(),
	}
});

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


module.exports = async (req, res) => {
	if (req.method === 'POST') {
		const { phone, placa, cidadeSelecionada, action, pagamento, horas } = req.body;
		
		if (action === 'selecionar_cidade') {
			if (!cidadeSelecionada || !cidadesMap[cidadeSelecionada]) {
				return res.status(400).json({ error: 'Cidade inválida. Escolha um número de 1 a 9.' });
			}

			const { nome, idOrgao } = cidadesMap[cidadeSelecionada];
			return res.json({ success: `Cidade selecionada: ${nome}`, idOrgao });
		}

		
		if (!phone) {
			return res.status(400).json({ error: 'Número de telefone não fornecido.' });
		}

		const sanitizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');

		if (sanitizedPhone.length < 10 || sanitizedPhone.length > 11) {
			return res.status(400).json({ error: 'Número de telefone inválido.' });
		}

		try {
			const idOrgao = req.body.idOrgao;
			
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
					return res.status(404).json({ error: 'Usuário não encontrado.' });
				}
			}

			
			if (action === 'verificar_placas') {
				const checkPlatesQuery = `
					SELECT placa 
					FROM veiculos 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
					AND idOrgao = $2
				`;
				const { rows } = await pool.query(checkPlatesQuery, [sanitizedPhone, idOrgao]);

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

			
			if (action === 'add_plate') {
				if (!placa) {
					return res.status(400).json({ error: 'Placa não fornecida.' });
				}

				// Sanitiza a placa
				const sanitizedPlaca = placa.trim().toUpperCase();

				
				const placaRegex = /^[A-Z0-9]{7}$/;
				if (!placaRegex.test(sanitizedPlaca)) {
					return res.status(400).json({
						error: 'Placa inválida. A placa deve ter exatamente 7 caracteres, com letras e números.',
					});
				}

				const checkQuery = 'SELECT placa FROM veiculos WHERE placa = $1 AND idOrgao = $2';
				const { rows: existingPlates } = await pool.query(checkQuery, [sanitizedPlaca, idOrgao]);

				if (existingPlates.length > 0) {
					return res.json({
						success: `A placa ${sanitizedPlaca} já está cadastrada.`,
					});
				}

			
				const insertPlateQuery = `
					INSERT INTO veiculos (telefone, placa, idorgao)
					VALUES ($1, $2, $3)
				`;

				await pool.query(insertPlateQuery, [sanitizedPhone, sanitizedPlaca, idOrgao]);

				return res.json({
					success: 'Placa cadastrada com sucesso.',
					placa: sanitizedPlaca
				});
			}

     
			if (action === 'consultar_saldo') {
				const query = `
					SELECT saldo 
					FROM usuarios 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
					AND idOrgao = $2
				`;
				const { rows } = await pool.query(query, [sanitizedPhone, idOrgao]);

				if (rows.length > 0) {
					return res.json({ success: 'Saldo encontrado.', saldo: rows[0].saldo });
				} else {
					return res.status(404).json({ error: 'Usuário não encontrado.' });
				}
			}

			if (action === 'verificar_saldo') {
				if (!phone || !horas || !idOrgao) {
					return res.status(400).json({ error: 'Dados incompletos para verificar o saldo.' });
				}
			
				const sanitizedPhone = phone.replace(/\D/g, '').replace(/^55/, '');
				const valor = horas === '1' ? 2.00 : 4.00;  // Valor baseado nas horas selecionadas
			
				try {
					// Consulta o saldo do usuário
					const saldoQuery = `
					SELECT saldo 
					FROM usuarios 
					WHERE REPLACE(REPLACE(REPLACE(telefone, '(', ''), ')', ''), '-', '') = $1
					AND idOrgao = $2
				`;
					const { rows } = await pool.query(saldoQuery, [sanitizedPhone, idOrgao]);
			
					if (rows.length === 0) {
						return res.status(404).json({ error: 'Usuário não encontrado.' });
					}
			
					const saldoAtual = parseFloat(rows[0].saldo);
			
					// Verifica se o saldo é suficiente
					if (saldoAtual < valor) {
						return res.status(400).json({ error: 'Saldo insuficiente para validar a placa.' });
					}
			
					// Retorna o saldo e informa que ele tem saldo suficiente
					return res.json({ saldo: saldoAtual, sucesso: 'Saldo suficiente para validar a placa.' });
			
				} catch (error) {
					console.error('Erro ao verificar saldo:', error);
					return res.status(500).json({ error: 'Erro interno do servidor.' });
				}
			}
			

			if (action === 'validar_placa') {
				if (!placa || !pagamento || !horas) {
					return res.status(400).json({ error: 'Dados incompletos para validação da placa.' });
				}
			
			   
				const sanitizedPlaca = placa.trim().toUpperCase();
			
				
				const valor = horas === '1' ? 2.00 : 4.00;
				const duracaoHoras = parseInt(horas);
				const now = new Date();
				const vencimento = new Date(now.getTime() + duracaoHoras * 60 * 60 * 1000);
			
				try {
					if (pagamento === '1') { 
						const saldoQuery = 'SELECT saldo FROM usuarios WHERE telefone = $1 AND idOrgao = $2';
						
						const { rows } = await pool.query(saldoQuery, [sanitizedPhone, idOrgao]);
			
						if (rows.length === 0) {
							return res.status(404).json({ error: 'Usuário não encontrado.' });
						}
			
						const saldoAtual = parseFloat(rows[0].saldo);
						if (saldoAtual < valor) {
							return res.status(400).json({ error: 'Saldo insuficiente.' });
						}
			
					   
						const updateSaldoQuery = 'UPDATE usuarios SET saldo = saldo - $1 WHERE telefone = $2 AND idOrgao = $3';
						await pool.query(updateSaldoQuery, [valor, sanitizedPhone, idOrgao]);
					}
			
					
					const metodoPagamento = pagamento === '1' ? 'saldo' : 'pix';
			
					const insertValidationQuery = `
						INSERT INTO validacoes (telefone, placa, pagamento, horas, valor_pago, horario_validacao, horario_vencimento, idOrgao)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					`;
					await pool.query(insertValidationQuery, [
						sanitizedPhone,
						sanitizedPlaca,
						metodoPagamento,
						duracaoHoras, 
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
				} catch (err) {
					console.error('Erro ao consultar ou atualizar o banco de dados:', err);
					return res.status(500).json({ error: 'Erro ao consultar ou atualizar o banco de dados.' });
				}
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
