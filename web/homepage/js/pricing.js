function handlePricingToggle() {
  const toggles = document.querySelectorAll('[data-pricing-toggle]');
  const toggleMarker = document.querySelector('[data-pricing-toggle-marker]');
  
  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const target = toggle.getAttribute('data-pricing-toggle');

      // Animate the toggle marker
      if (toggleMarker.getAttribute('data-pricing-current') !== target) {
        const targetToggle = document.querySelector(`[data-pricing-toggle="${target}"]`);
        const targetToggleRect = targetToggle.getBoundingClientRect();
        const markerRect = toggleMarker.getBoundingClientRect();
        const translateX = targetToggleRect.left < markerRect.left ? targetToggleRect.left - markerRect.left : 0;

        toggleMarker.animate(
          [
            { transform: `translateX(${translateX}px)` }
          ],
          {
            duration: 300,
            easing: 'ease-in-out',
            fill: 'forwards'
          }
        );
        toggleMarker.setAttribute('data-pricing-current', target);
      }
      
      document.querySelectorAll(`[data-pricing-${target}]`).forEach(targetElement => {
        targetElement.innerHTML = targetElement.getAttribute(`data-pricing-${target}`);
      })
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  handlePricingToggle();
});
