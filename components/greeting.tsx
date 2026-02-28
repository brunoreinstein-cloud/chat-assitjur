import { motion } from "framer-motion";

export const Greeting = () => {
	return (
		<div
			className="mx-auto mt-4 flex size-full max-w-3xl flex-col justify-center gap-4 px-4 md:mt-16 md:px-8"
			key="overview"
		>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="font-semibold text-xl md:text-2xl"
				exit={{ opacity: 0, y: 10 }}
				initial={{ opacity: 0, y: 10 }}
				transition={{ delay: 0.5 }}
			>
				Revisor de Defesas Trabalhistas
			</motion.div>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="text-lg text-zinc-500 md:text-xl"
				exit={{ opacity: 0, y: 10 }}
				initial={{ opacity: 0, y: 10 }}
				transition={{ delay: 0.6 }}
			>
				Audito contestações, aponto correções e preparo a equipe para audiência.
				Não redijo peças — apenas avalio e gero parecer, roteiro do advogado e
				roteiro do preposto.
			</motion.div>
			<motion.div
				animate={{ opacity: 1, y: 0 }}
				className="text-muted-foreground mt-2 text-sm"
				exit={{ opacity: 0, y: 10 }}
				initial={{ opacity: 0, y: 10 }}
				transition={{ delay: 0.7 }}
			>
				Para começar: envie a <strong>Petição Inicial</strong> e a{" "}
				<strong>Contestação</strong> (cole o texto ou anexe). Opcional:
				documentos do reclamante/reclamada e base de teses (@bancodetese).
			</motion.div>
		</div>
	);
};
