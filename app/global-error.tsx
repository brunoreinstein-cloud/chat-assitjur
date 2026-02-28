"use client";

export default function GlobalError({
	error,
	reset,
}: Readonly<{
	error: Error & { digest?: string };
	reset: () => void;
}>) {
	const isConfigError =
		error.message.includes("POSTGRES_URL") ||
		error.message.includes("AUTH_SECRET");

	return (
		<html lang="pt-BR">
			<body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
				<div
					style={{
						minHeight: "100vh",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: "1.5rem",
						boxSizing: "border-box",
					}}
				>
					<div style={{ maxWidth: "32rem", textAlign: "center" }}>
						<h1
							style={{
								fontSize: "1.5rem",
								fontWeight: 700,
								marginBottom: "1rem",
							}}
						>
							Esta página não está a funcionar
						</h1>
						<p style={{ color: "#666", marginBottom: "1.5rem" }}>
							Ocorreu um erro no servidor. Se estiver a usar a Vercel, verifique
							as variáveis de ambiente.
						</p>
						{isConfigError && (
							<pre
								style={{
									background: "#f5f5f5",
									padding: "1rem",
									borderRadius: "0.5rem",
									fontSize: "0.875rem",
									textAlign: "left",
									overflow: "auto",
									marginBottom: "1.5rem",
								}}
							>
								{error.message}
							</pre>
						)}
						<button
							onClick={() => reset()}
							style={{
								background: "#000",
								color: "#fff",
								border: "none",
								padding: "0.75rem 1.5rem",
								borderRadius: "0.5rem",
								fontSize: "1rem",
								cursor: "pointer",
							}}
							type="button"
						>
							Tentar novamente
						</button>
					</div>
				</div>
			</body>
		</html>
	);
}
