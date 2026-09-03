import { useState } from 'react';

import { PageHero } from '../../components/ui/PageHero';
import bgPlaceholder from '../../assets/images/contact/contact-bg-placeholder.svg';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Frontend only demonstration
    setSubmitted(true);
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-24">
      <PageHero
        title="Get in Touch"
        description="Speak with our engineering team to discuss how GoodEnough Energy can optimize your site's energy infrastructure."
        bgImage={bgPlaceholder}
        badge="Contact Us"
      />

      <section className="py-24 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
          {submitted ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Message Received</h2>
              <p className="text-lg text-slate-600 mb-8">Thank you for contacting GoodEnough Energy. A member of our team will be in touch shortly.</p>
              <button 
                onClick={() => setSubmitted(false)}
                className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold rounded-full transition-colors"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                  <input type="text" id="name" required className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-slate-50 focus:bg-white" placeholder="Jane Doe" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                  <input type="email" id="email" required className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-slate-50 focus:bg-white" placeholder="jane@company.com" />
                </div>
              </div>
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                <input type="text" id="company" className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-slate-50 focus:bg-white" placeholder="Your Company Ltd." />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-2">How can we help?</label>
                <textarea id="message" required rows={5} className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-slate-50 focus:bg-white" placeholder="Tell us about your energy storage needs..."></textarea>
              </div>
              <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-primary-600 text-white font-semibold rounded-xl shadow-sm transition-colors text-lg">
                Send Message
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
