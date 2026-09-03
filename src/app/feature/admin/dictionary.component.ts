import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@ngneat/transloco';
import type { DictionaryEntry } from '../../api/model/dictionary-entry';
import { DictionaryApiService } from '../../core/dictionary/dictionary.service';

type LoadState = 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Admin dictionary editor at `/admin/dictionary` (legacy DictionaryComponent
 * parity): all translation entries with a client-side category filter, plus
 * an add-entry form (category/key/language/value → POST /dictionary/entry)
 * and per-row delete. BE authorizes ADMIN on the mutating endpoints.
 */
@Component({
  selector: 'app-admin-dictionary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoModule,
  ],
  templateUrl: './dictionary.component.html',
})
export class AdminDictionaryComponent implements OnInit {
  private readonly api = inject(DictionaryApiService);

  readonly state = signal<LoadState>('loading');
  readonly entries = signal<DictionaryEntry[]>([]);
  readonly categories = signal<string[]>([]);
  readonly category = signal<string>('all');
  readonly saveError = signal<boolean>(false);

  readonly filtered = computed(() => {
    const wanted = this.category();
    const all = this.entries();
    return wanted === 'all' ? all : all.filter((entry) => entry.category === wanted);
  });

  readonly form = new FormGroup({
    category: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    key: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    languageCode: new FormControl('pl', { nonNullable: true, validators: [Validators.required] }),
    value: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.api.entries().subscribe({
      next: (entries) => {
        this.entries.set(entries);
        this.state.set(entries.length === 0 ? 'empty' : 'loaded');
      },
      error: () => this.state.set('error'),
    });
    this.api.categories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: () => undefined, // filter degrades to "all" — the table is authoritative
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saveError.set(false);
    this.api.create(this.form.getRawValue()).subscribe({
      next: (created) => {
        this.entries.update((all) => [created, ...all]);
        this.state.set('loaded');
        if (created.category && !this.categories().includes(created.category)) {
          this.categories.update((all) => [...all, created.category!]);
        }
        this.form.reset({ category: '', key: '', languageCode: 'pl', value: '' });
      },
      error: () => this.saveError.set(true),
    });
  }

  remove(entry: DictionaryEntry): void {
    if (!entry.id) return;
    this.api.delete(entry.id).subscribe({
      next: () => {
        this.entries.update((all) => all.filter((e) => e.id !== entry.id));
        if (this.entries().length === 0) this.state.set('empty');
      },
      error: () => this.saveError.set(true),
    });
  }
}
