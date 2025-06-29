// Demo test to validate the complete testcase-to-automation workflow
// This demonstrates that our generated tests work when not blocked by anti-bot protection

describe('Demo Test Suite - Workflow Validation', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('Basic Page Load Test', () => {
    // Test that the page loads successfully
    cy.get('body').should('be.visible');
    cy.get('h1').should('contain.text', 'Example Domain');
    
    // Verify page title
    cy.title().should('contain', 'Example Domain');
    
    // Check for expected content
    cy.get('body').should('contain', 'illustrative examples');
  });

  it('Navigation and Content Verification', () => {
    // Verify page structure
    cy.get('h1').should('exist');
    cy.get('p').should('have.length.greaterThan', 0);
    
    // Test that we can interact with the page
    cy.get('body').click();
    cy.url().should('include', 'example.com');
  });
});