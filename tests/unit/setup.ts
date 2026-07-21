// Mock IntersectionObserver for jsdom environment
// Required by Framer Motion's whileInView feature
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  private callbacks: IntersectionObserverCallback[] = [];
  private elements: Element[] = [];

  observe(target: Element) {
    this.elements.push(target);
  }

  unobserve(target: Element) {
    this.elements = this.elements.filter((el) => el !== target);
  }

  disconnect() {
    this.elements = [];
    this.callbacks = [];
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
