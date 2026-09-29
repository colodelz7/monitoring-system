import { Component } from 'react';
import Icon from './Icon';

/**
 * Isola a falha de uma aba.
 *
 * Sem isso, um erro de render no mapa ou num gráfico desmonta a árvore inteira
 * e o painel some. Aqui a aba quebrada mostra o erro e o resto continua de pé.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[MONITORING] falha ao renderizar', error, info);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="empty-state">
        <div className="empty-icon" style={{ color: 'var(--red)' }}><Icon name="alert" size={30} /></div>
        <div className="empty-text">Esta seção falhou ao carregar</div>
        <div className="empty-sub">{this.state.error.message}</div>
        <button className="ghost-btn" onClick={this.retry} style={{ marginTop: 12 }}>Tentar de novo</button>
      </div>
    );
  }
}
