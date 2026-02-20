import { Layout } from './components/Layout';
import { ZkSeepGame } from './games/zk-seep/ZkSeepGame';

const GAME_TITLE = import.meta.env.VITE_GAME_TITLE || 'Zk Seep';
const GAME_TAGLINE = import.meta.env.VITE_GAME_TAGLINE || 'Zero-knowledge card game on Stellar';

export default function App() {
  return (
    <Layout title={GAME_TITLE} subtitle={GAME_TAGLINE}>
      <ZkSeepGame
        onStandingsRefresh={() => { }}
        onGameComplete={() => { }}
      />
    </Layout>
  );
}
