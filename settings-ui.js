/**
 * Settings UI Handler
 * Manages Settings tab interactions
 */

document.addEventListener('DOMContentLoaded', function() {
  // Handle main tab switching including Settings tab
  const mainTabs = document.querySelectorAll('.main-tabs .tab-button');
  const mainSections = document.querySelectorAll('.main-section');
  
  mainTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.id.replace('-tab', '-section');
      
      // Update active tab
      mainTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding section
      mainSections.forEach(section => {
        section.classList.toggle('hidden', section.id !== targetId);
      });
      
      // Initialize settings section if clicked
      if (targetId === 'settings-main-section') {
        console.log('Settings section opened');
      }
    });
  });
});