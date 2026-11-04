// A screen that fails to render stays inside this box: the bar and «← Розділи»
// above it keep working, in the web version and the Windows app alike. A saved
// state the checks let through could otherwise blank the same link on every
// reload. No logging and nothing dropped by itself: the learner chooses, and a
// new `resetKey` (navigation, a new place, a clearing) tries the screen again.
import { Component } from 'react';
import Button from '../ui/components/Button.jsx';
import { uk } from './uk.js';

export default class ScreenBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previous) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { onBack, onClear } = this.props;
    return (
      <div className="ng-screen-failed">
        <p>{uk.screenFailed}</p>
        <Button onClick={onBack}>{uk.screenBack}</Button>
        {onClear && <Button variant="quiet" onClick={onClear}>{uk.resetProgress}</Button>}
      </div>
    );
  }
}
