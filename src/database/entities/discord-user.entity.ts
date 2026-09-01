import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('discord_users')
export class DiscordUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'discord_id', unique: true, type: 'varchar' })
  discordId: string;

  @Column({ name: 'username', type: 'varchar' })
  username: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
